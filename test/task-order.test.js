import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('remembered project positions migrate, survive restarts, and preserve current task fields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-order-'));
  const dbPath = join(directory, 'workboard.sqlite');
  // Task 011 database: current display order differs from ID order after a move.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (id, name) VALUES (1, 'Source'), (2, 'Destination'), (3, 'Third');
    INSERT INTO tasks (id, project_id, title, position) VALUES
      (1, 1, 'Last', 9), (2, 1, 'First', 3), (3, 1, 'Middle', 7), (4, 2, 'Resident', 1);
  `);
  legacy.close();
  let child;
  let origin;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      let output = '';
      let errors = '';
      const timeout = setTimeout(() => reject(new Error(`Startup timed out: ${errors}`)), 5000);
      child.stderr.on('data', chunk => { errors += chunk; });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${errors}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { origin = `http://127.0.0.1:${match[1]}`; clearTimeout(timeout); resolve(); }
      });
    });
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function request(path, method = 'GET', body) {
    const response = await fetch(`${origin}/api/projects${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    return { status: response.status, data };
  }
  const tasks = async project => (await request(`/${project}/tasks`)).data;
  const ids = async project => (await tasks(project)).map(task => task.id);
  const move = (source, task, destination) => request(`/${source}/tasks/${task}`, 'PATCH', { destination_project_id: destination });
  const edit = (project, task, body) => request(`/${project}/tasks/${task}`, 'PATCH', body);
  async function moved(source, task, destination) {
    assert.equal((await move(source, task, destination)).status, 200);
  }
  try {
    await start();
    assert.deepEqual(await ids(1), [2, 3, 1]);
    await moved(1, 2, 2);
    await moved(1, 3, 2);
    await moved(1, 1, 2);
    assert.deepEqual(await ids(1), []);
    assert.deepEqual(await ids(2), [4, 2, 3, 1]);
    // A completely empty source still retains its reserved positions.
    const created = await request('/1/tasks', 'POST', { title: 'New while others away' });
    assert.equal(created.status, 201);
    const newId = created.data.id;
    await moved(2, 4, 1);
    assert.deepEqual(await ids(1), [newId, 4]);
    await edit(2, 2, { title: 'Current title' });
    await edit(2, 2, { completed: true });
    await edit(2, 2, { priority: 'High' });
    await edit(2, 2, { due_date: '0001-01-01' });
    const current = (await tasks(2)).find(task => task.id === 2);
    await request('/1', 'PATCH', { name: 'Renamed source' });
    await request('/1', 'PATCH', { archived: true });
    assert.equal((await move(2, 2, 1)).status, 409);
    assert.deepEqual(await ids(1), [newId, 4]);
    await stop();
    await start();
    assert.deepEqual(await ids(2), [2, 3, 1]);
    assert.equal((await move(1, 4, 2)).status, 409);
    await request('/1', 'PATCH', { archived: false });
    await request('/1', 'PATCH', { default_priority: 'Low' });
    // Return in reverse order, including after a restart midway through returning.
    await moved(2, 1, 1);
    await moved(2, 3, 1);
    assert.deepEqual(await ids(1), [3, 1, newId, 4]);
    await stop();
    await start();
    await moved(2, 2, 1);
    assert.deepEqual(await ids(1), [2, 3, 1, newId, 4]);
    assert.deepEqual((await tasks(1))[0], current);
    assert.equal((await request('/1')).data.completed, 1);
    assert.equal((await request('/1')).data.total, 5);
    assert.equal((await request('/2')).data.total, 0);
    // A third project remembers its own order, independent of the first two.
    await moved(1, 3, 3);
    await moved(1, 2, 3);
    assert.deepEqual(await ids(3), [3, 2]);
    await moved(3, 3, 2);
    await moved(3, 2, 2);
    await moved(1, 4, 2);
    assert.deepEqual(await ids(2), [4, 2, 3]);
    await moved(2, 2, 3);
    await moved(2, 3, 3);
    assert.deepEqual(await ids(3), [3, 2]);
    await stop();
    await start();
    assert.deepEqual(await ids(3), [3, 2]);
    assert.deepEqual((await tasks(3))[1], current);
    assert.deepEqual(await ids(1), [1, newId]);
    assert.deepEqual(await ids(2), [4]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
