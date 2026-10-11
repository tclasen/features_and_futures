import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('Task 015 upgrade, deletion, restoration, reserved order, ownership, summaries, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const database = join(directory, 'workboard.sqlite');
  const notes = '  Preserved\n雪 😀 <b>literal</b>\n\t ';
  const legacy = new DatabaseSync(database);
  legacy.exec(`CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal'
  );
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE task_positions (
    task_id INTEGER NOT NULL REFERENCES tasks(id), project_id INTEGER NOT NULL REFERENCES projects(id),
    position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id), UNIQUE (project_id, position)
  );
  INSERT INTO projects (name) VALUES ('Source'), ('Destination');
  INSERT INTO tasks (project_id, title, completed, priority, due_date, position) VALUES
    (1, 'First', 1, 'High', '0001-01-01', 10), (1, 'Second', 0, 'Low', '', 20);
  INSERT INTO task_positions VALUES (1, 1, 10), (2, 1, 20), (1, 2, 5);`);
  legacy.prepare('UPDATE tasks SET notes = ? WHERE id = 1').run(notes);
  legacy.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: database }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
      child.once('error', reject);
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
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
  const tasks = async id => (await call(`/api/projects/${id}/tasks`)).data;
  const edit = (project, task, body) => call(`/api/projects/${project}/tasks/${task}`, 'PATCH', body);
  const summary = async id => {
    const { data } = await call(`/api/projects/${id}`);
    return [data.completed, data.total];
  };
  try {
    await start();
    assert.deepEqual(await call('/health'), { status: 200, data: { status: 'ok' } });
    const original = await tasks(1);
    assert.deepEqual(original, [
      { id: 1, title: 'First', completed: true, priority: 'High', due_date: '0001-01-01', notes, deleted: false },
      { id: 2, title: 'Second', completed: false, priority: 'Low', due_date: '', notes: '', deleted: false },
    ]);
    for (const deleted of ['true', 1, null]) assert.equal((await edit(1, 1, { deleted })).status, 400);
    assert.equal((await edit(2, 1, { deleted: true })).status, 404);
    assert.equal((await edit(1, 999, { deleted: true })).status, 404);
    assert.deepEqual((await edit(1, 1, { deleted: true })).data, { ...original[0], deleted: true });
    assert.deepEqual(await summary(1), [0, 1]);
    for (const body of [
      { completed: false }, { title: 'Changed' }, { priority: 'Normal' },
      { due_date: '' }, { notes: '' }, { destination_project_id: 2 },
    ]) assert.equal((await edit(1, 1, body)).status, 409);
    await edit(1, 2, { deleted: true });
    assert.deepEqual(await summary(1), [0, 0]);
    await call('/api/projects/1', 'PATCH', { default_priority: 'Normal', });
    const third = (await call('/api/projects/1/tasks', 'POST', { title: 'Third' })).data;
    assert.equal(third.deleted, false);
    assert.equal(third.notes, '');
    await call('/api/projects/1', 'PATCH', { archived: true });
    assert.equal((await edit(1, 1, { deleted: false })).status, 409);
    assert.equal((await edit(1, third.id, { deleted: true })).status, 409);
    await stop();
    await start();
    assert.deepEqual(await tasks(1), [{ ...original[0], deleted: true }, { ...original[1], deleted: true }, third]);
    assert.deepEqual(await summary(1), [0, 1]);
    await call('/api/projects/1', 'PATCH', { archived: false });
    // Restore in reverse order; neither restoration nor default changes replace fields.
    assert.deepEqual((await edit(1, 2, { deleted: false })).data, original[1]);
    assert.deepEqual((await edit(1, 1, { deleted: false })).data, original[0]);
    assert.deepEqual(await tasks(1), [...original, third]);
    assert.deepEqual(await summary(1), [1, 3]);
    await edit(1, 1, { destination_project_id: 2 });
    assert.deepEqual(await tasks(2), [original[0]]);
    assert.deepEqual(await summary(2), [1, 1]);
    await edit(2, 1, { deleted: true });
    assert.deepEqual(await summary(2), [0, 0]);
    assert.equal((await edit(2, 1, { destination_project_id: 1 })).status, 409);
    await stop();
    await start();
    await edit(2, 1, { deleted: false });
    await edit(2, 1, { destination_project_id: 1 });
    assert.deepEqual(await tasks(1), [...original, third]);
    assert.deepEqual(await tasks(2), []);
    await stop();
    await start();
    assert.deepEqual(await tasks(1), [...original, third]);
    assert.deepEqual(await summary(1), [1, 3]);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
