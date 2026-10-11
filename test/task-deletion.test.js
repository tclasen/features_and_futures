import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('deletion preserves migrated data, reserved order, summaries, restrictions and restart state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (id, name) VALUES (1, 'Source'), (2, 'Destination');
    INSERT INTO tasks (id, project_id, title, completed, priority, due_date, notes, position) VALUES
      (1, 1, 'First', 1, 'High', '2026-10-11', '  日本語 <b>literal</b>
line two  ', 1), (2, 1, 'Second', 0, 'Low', '', '', 2);
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
  const live = async project => (await tasks(project)).filter(task => !task.deleted);
  const summary = async (project, total, completed) => {
    const data = (await request(`/${project}`)).data;
    assert.equal(data.total, total);
    assert.equal(data.completed, completed);
  };
  try {
    await start();
    const [original, second] = await tasks(1);
    assert.equal(original.deleted, false);
    assert.ok((await tasks(1)).every(task => !task.deleted));
    assert.equal((await edit(1, 1, { deleted: 'true' })).status, 400);
    const removed = await edit(1, 1, { deleted: true });
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.data, { ...original, deleted: true });
    assert.deepEqual((await live(1)).map(task => task.id), [2]);
    await summary(1, 1, 0);
    for (const change of [{ title: 'Changed' }, { completed: false }, { priority: 'Normal' },
      { due_date: '' }, { notes: '' }, { destination_project_id: 2 }]) {
      assert.equal((await edit(1, 1, change)).status, 409);
    }
    assert.deepEqual((await tasks(1))[0], removed.data);
    assert.deepEqual(await tasks(2), []);
    await edit(1, 2, { deleted: true });
    await summary(1, 0, 0);
    await request('/1', 'PATCH', { default_priority: 'Low' });
    const later = (await request('/1/tasks', 'POST', { title: 'Later' })).data;
    assert.equal(later.deleted, false);
    await request('/1', 'PATCH', { archived: true });
    assert.equal((await edit(1, 1, { deleted: false })).status, 409);
    assert.equal((await edit(1, later.id, { deleted: true })).status, 409);
    await stop();
    await start();
    assert.deepEqual((await tasks(1))[0], removed.data);
    await summary(1, 1, 0);
    await request('/1', 'PATCH', { archived: false });
    await edit(1, 2, { deleted: false });
    assert.deepEqual((await live(1)).map(task => task.id), [2, later.id]);
    assert.deepEqual((await edit(1, 1, { deleted: false })).data, original);
    assert.deepEqual(await tasks(1), [original, second, later]);
    assert.deepEqual((await live(1)).map(task => task.id), [1, 2, later.id]);
    await summary(1, 3, 1);
    await moved(1, 1, 2);
    await edit(2, 1, { deleted: true });
    await summary(1, 2, 0);
    await summary(2, 0, 0);
    await stop();
    await start();
    assert.deepEqual((await tasks(2))[0], removed.data);
    await edit(2, 1, { deleted: false });
    await moved(2, 1, 1);
    assert.deepEqual((await live(1)).map(task => task.id), [1, 2, later.id]);
    assert.deepEqual((await tasks(1))[0], original);
    await summary(1, 3, 1);
    await summary(2, 0, 0);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
