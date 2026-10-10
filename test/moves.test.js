import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit']
  });
  const [output] = await once(child.stdout, 'data');
  return {
    base: `http://127.0.0.1:${String(output).match(/listening on port (\d+)/)[1]}`,
    async stop() {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    }
  };
}

const taskIds = html => [...html.matchAll(/data-completion-url="\/projects\/\d+\/tasks\/(\d+)\/completion"/g)].map(match => Number(match[1]));
const destinations = html => [...html.matchAll(/<select id="destination-project-\d+"[^>]*>([\s\S]*?)<\/select>/g)]
  .map(match => [...match[1].matchAll(/<option value="(\d+)">([^<]*)<\/option>/g)].map(option => [Number(option[1]), option[2]]));

test('task moves append on first arrival, restore prior positions, preserve data and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const dbPath = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source');
    INSERT INTO tasks (project_id, title) VALUES (1, 'First'), (1, 'Second');`);
  legacy.close();
  let server;
  try {
    server = await start(dbPath);
    const get = path => fetch(server.base + path).then(response => response.text());
    const post = (path, fields = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const move = (source, task, destination) => post(`/projects/${source}/tasks/${task}/move`, { destination_id: destination });
    let detail = await get('/projects/1');
    assert.deepEqual(taskIds(detail), [1, 2]);
    assert.deepEqual(destinations(detail), [[], []]);
    assert.match(detail, /id="destination-project-1"[^>]* disabled/);
    assert.match(detail, /<button type="submit" disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Archived' });
    await post('/projects', { name: 'Last' });
    await post('/projects/3/archive');
    await post('/projects/2/rename', { name: 'Renamed & destination' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/1/tasks', { title: 'Source third' });
    assert.deepEqual(destinations(await get('/projects/1')), Array(3).fill([[2, 'Renamed &amp; destination'], [4, 'Last']]));
    await post('/projects/1/tasks/1/completion', { completed: 'true' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { due_date: '0001-01-01' });
    await post('/projects/1/tasks/1/rename', { title: 'Moved title' });
    const before = await get('/projects/1');
    for (const destination of ['1', '3', '999', '', 'invalid']) {
      assert.equal((await move(1, 1, destination)).status, 422);
      assert.equal(await get('/projects/1'), before);
    }
    assert.equal((await move(2, 1, '4')).status, 404);
    assert.equal((await move(1, 999, '2')).status, 404);
    assert.equal((await move(1, 1, '2')).status, 204);
    assert.deepEqual(taskIds(await get('/projects/1')), [2, 4]);
    detail = await get('/projects/2');
    assert.deepEqual(taskIds(detail), [3, 1]);
    assert.match(detail, /Complete Moved title/);
    assert.match(detail, /tasks\/1\/completion" checked/);
    assert.match(detail, /id="task-priority-1"[^>]*data-saved-priority="High"/);
    assert.match(detail, /id="task-due-date-1"[^>]*value="0001-01-01"/);
    assert.deepEqual(destinations(detail), Array(2).fill([[1, 'Source'], [4, 'Last']]));
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await post('/projects/2/tasks', { title: 'Destination new' });
    assert.deepEqual(taskIds(await get('/projects/2')), [3, 1, 5]);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(taskIds(await get('/projects/2')), [3, 1, 5]);
    assert.equal((await move(2, 1, '1')).status, 204);
    assert.deepEqual(taskIds(await get('/projects/1')), [1, 2, 4]);
    assert.equal((await move(1, 2, '2')).status, 204); // Blank date and Normal priority survive.
    detail = await get('/projects/2');
    assert.deepEqual(taskIds(detail), [3, 5, 2]);
    assert.match(detail, /id="task-due-date-2"[^>]*value=""/);
    assert.match(detail, /id="task-priority-2"[^>]*data-saved-priority="Normal"/);
    await post('/projects/1/archive');
    detail = await get('/projects/1');
    assert.match(detail, /id="destination-project-1"[^>]* disabled/);
    assert.match(detail, /<button type="submit" disabled>Move task/);
    assert.equal((await move(1, 1, '2')).status, 403);
    assert.equal((await move(2, 2, '1')).status, 422);
    await server.stop();
    server = await start(dbPath);
    await post('/projects/1/restore');
    detail = await get('/projects/1');
    assert.doesNotMatch(detail, /id="destination-project-1"[^>]* disabled/);
    assert.match(detail, /id="task-due-date-1"[^>]*value="0001-01-01"/);
    assert.equal((await move(1, 1, '2')).status, 204);
    assert.deepEqual(taskIds(await get('/projects/2')), [3, 1, 5, 2]);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(taskIds(await get('/projects/2')), [3, 1, 5, 2]);
    assert.match(await get('/'), /data-testid="project-summary">1\/4 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
