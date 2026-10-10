import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.on('error', reject);
    child.on('exit', () => reject(new Error(output)));
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

const taskIds = (body) => [...body.matchAll(/aria-label="Complete ([^"]+)"/g)].map((match) => match[1]);
const destinations = (body) => body.match(/<select id="destination-project-1"[^>]*>([\s\S]*?)<\/select>/)[1].trim();

test('moves append, preserve data and source filters, restrict destinations, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const databasePath = join(directory, 'board.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'First', 1), (1, 'Remaining', 1)`);
  legacy.close();
  let server;
  try {
    server = await start(databasePath);
    const post = (path, fields = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async (path) => (await fetch(server.url + path)).text();
    let body = await html('/projects/1');
    assert.match(body, /id="destination-project-1" name="destination" disabled/);
    assert.match(body, /<button type="submit" disabled>Move task/);
    assert.equal(destinations(body), '');
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Archived' });
    await post('/projects', { name: 'Third' });
    await post('/projects/3/archive');
    await post('/projects/2/rename', { name: 'Renamed destination' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Destination existing' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2025-04-02' });
    await post('/projects/1/tasks/2/due-date', { dueDate: '2025-04-03' });
    assert.equal(destinations(await html('/projects/1')), '<option value="2">Renamed destination</option><option value="4">Third</option>');
    const fields = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2025-04-01', dueThrough: '2025-04-30' };
    const filtered = '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2025-04-01&dueThrough=2025-04-30';
    for (const destination of ['1', '3', '999', '']) {
      assert.equal((await post('/projects/1/tasks/1/move', { ...fields, destination })).status, 400);
      assert.deepEqual(taskIds(await html(filtered)), ['First', 'Remaining']);
    }
    assert.equal((await post('/projects/4/tasks/1/move', { destination: '2' })).status, 404);
    const response = await post('/projects/1/tasks/1/move', { ...fields, destination: '2' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), filtered);
    assert.deepEqual(taskIds(await html(filtered)), ['Remaining']);
    body = await html('/projects/2');
    assert.deepEqual(taskIds(body), ['Destination existing', 'First']);
    assert.match(body, /aria-label="Complete First" checked/);
    assert.match(body, /id="task-priority-1"[\s\S]*?<option selected>High/);
    assert.match(body, /id="task-due-date-1"[^>]*value="2025-04-02"/);
    assert.match(await html('/'), /data-testid="project-summary">1\/1 completed/);
    assert.match(await html('/'), /data-testid="project-summary">1\/2 completed/);
    await post('/projects/2/tasks', { title: 'After move' });
    assert.deepEqual(taskIds(await html('/projects/2')), ['Destination existing', 'First', 'After move']);
    await post('/projects/2/archive');
    body = await html('/projects/2');
    assert.match(body, /id="destination-project-1" name="destination" disabled/);
    assert.match(body, /<button type="submit" disabled>Move task/);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 403);
    await post('/projects/2/restore');
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(taskIds(await html('/projects/2')), ['Destination existing', 'First', 'After move']);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 303);
    assert.deepEqual(taskIds(await html('/projects/1')), ['Remaining', 'First']);
    // Blank dates and destination defaults must not replace a moved task's values.
    await post('/projects/2/tasks/3/move', { destination: '1' });
    body = await html('/projects/1');
    assert.deepEqual(taskIds(body), ['Remaining', 'First', 'Destination existing']);
    assert.match(body, /id="task-due-date-3"[^>]*value=""/);
    assert.match(body, /id="task-priority-3"[\s\S]*?<option selected>Low/);
    const db = new DatabaseSync(databasePath);
    const moved = db.prepare('SELECT * FROM tasks WHERE id = 1').get();
    assert.equal(moved.project_id, 1);
    assert.equal(moved.completed, 1);
    assert.equal(moved.priority, 'High');
    assert.equal(moved.due_date, '2025-04-02');
    db.close();
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
