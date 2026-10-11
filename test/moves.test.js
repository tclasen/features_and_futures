import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('moves append, preserve task data and summaries, reject archived projects, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const database = join(directory, 'workboard.sqlite');
  // Task 010 schema: migration must retain the existing project task order.
  const legacy = new DatabaseSync(database);
  legacy.exec(`CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal'
  );
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT ''
  );
  INSERT INTO projects (name) VALUES ('Source'), ('Destination'), ('Third');
  INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES
    (1, 'Early dated task', 1, 'High', '0001-01-01'),
    (1, 'Undated task', 0, 'Low', ''),
    (2, 'Destination task', 0, 'Normal', '2024-02-29');`);
  legacy.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: database },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Startup timeout')), 10000);
      child.once('error', reject);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  const call = async (path, method = 'GET', body) => {
    const response = await fetch(`${base}${path}`, {
      method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  };
  const tasks = async project => (await call(`/api/projects/${project}/tasks`)).data;
  const project = async id => (await call(`/api/projects/${id}`)).data;
  const move = (source, id, destination) => call(`/api/projects/${source}/tasks/${id}`, 'PATCH', { destination_project_id: destination });
  const archive = (id, archived) => call(`/api/projects/${id}`, 'PATCH', { archived });
  try {
    await start();
    assert.deepEqual((await tasks(1)).map(task => task.id), [1, 2]);
    const [dated, undated] = await tasks(1);
    const [destinationTask] = await tasks(2);
    await call('/api/projects/2', 'PATCH', { default_priority: 'Low' });
    for (const invalid of [1, 0, -1, null, '2', 1.5]) {
      assert.equal((await move(1, 1, invalid)).status, 400);
    }
    assert.equal((await move(1, 1, 999)).status, 404);
    assert.equal((await move(2, 1, 3)).status, 404);
    await archive(2, true);
    assert.equal((await move(1, 1, 2)).status, 409);
    await archive(2, false);
    await archive(1, true);
    assert.equal((await move(1, 1, 2)).status, 409);
    assert.deepEqual(await tasks(1), [dated, undated]);
    assert.deepEqual(await tasks(2), [destinationTask]);
    await archive(1, false);
    assert.deepEqual(await move(1, 1, 2), { status: 200, data: dated });
    assert.deepEqual(await tasks(1), [undated]);
    assert.deepEqual(await tasks(2), [destinationTask, dated]);
    assert.deepEqual([(await project(1)).completed, (await project(1)).total], [0, 1]);
    assert.deepEqual([(await project(2)).completed, (await project(2)).total], [1, 2]);
    assert.equal((await call('/api/projects/1/tasks/1', 'PATCH', { title: 'Wrong owner' })).status, 404);
    const added = (await call('/api/projects/2/tasks', 'POST', { title: 'New task' })).data;
    assert.equal(added.priority, 'Low');
    assert.deepEqual(await tasks(2), [destinationTask, dated, added]);
    await move(1, 2, 2);
    assert.deepEqual(await tasks(2), [destinationTask, dated, added, undated]);
    assert.deepEqual(await tasks(1), []);
    assert.deepEqual([(await project(1)).completed, (await project(1)).total], [0, 0]);
    assert.deepEqual([(await project(2)).completed, (await project(2)).total], [1, 4]);
    await stop();
    await start();
    assert.deepEqual(await tasks(2), [destinationTask, dated, added, undated]);
    assert.deepEqual(await tasks(1), []);
    await move(2, 1, 3);
    await move(3, 1, 2);
    assert.deepEqual(await tasks(2), [destinationTask, added, undated, dated]);
    await call('/api/projects/2/tasks/1', 'PATCH', { title: 'Renamed after moving' });
    dated.title = 'Renamed after moving';
    assert.deepEqual(await tasks(2), [destinationTask, added, undated, dated]);
    await archive(2, true);
    await stop();
    await start();
    assert.equal((await project(2)).archived, 1);
    assert.equal((await move(2, 1, 3)).status, 409);
    await archive(2, false);
    assert.deepEqual(await move(2, 1, 1), { status: 200, data: dated });
    assert.deepEqual(await tasks(1), [dated]);
    assert.deepEqual(await tasks(2), [destinationTask, added, undated]);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
