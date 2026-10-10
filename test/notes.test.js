import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('notes migrate without data loss, preserve exact text, and travel through moves and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE task_positions (task_id INTEGER NOT NULL REFERENCES tasks(id),
      project_id INTEGER NOT NULL REFERENCES projects(id), position INTEGER NOT NULL,
      PRIMARY KEY (task_id, project_id), UNIQUE (project_id, position));
    INSERT INTO projects (name, default_priority) VALUES ('First', 'High'), ('Second', 'Low');
    INSERT INTO tasks (project_id, title, completed, priority, due_date, position) VALUES
      (1, 'Existing done', 1, 'High', '2028-02-29', 1), (1, 'Existing open', 0, 'Low', '', 2),
      (2, 'Other project', 0, 'Normal', '0001-01-01', 2);
    INSERT INTO task_positions VALUES (1, 1, 1), (1, 2, 1), (2, 1, 2), (3, 2, 2);
  `);
  database.close();
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PORT: String(port), DB_PATH: databasePath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', (chunk) => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Server did not become healthy: ${output}`);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  const get = async (path) => (await fetch(`${base}${path}`)).json();
  const write = (path, body, method = 'PATCH') => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const tasksPath = '/api/projects/1/tasks';
  try {
    await start();
    const tasks = await get(tasksPath);
    assert.deepEqual(tasks, [
      { id: 1, title: 'Existing done', completed: true, priority: 'High', due_date: '2028-02-29', notes: '' },
      { id: 2, title: 'Existing open', completed: false, priority: 'Low', due_date: '', notes: '' },
    ]);
    const otherTasks = await get('/api/projects/2/tasks');
    const created = await (await write(tasksPath, { title: 'New' }, 'POST')).json();
    assert.equal(created.notes, '');
    tasks.push(created);
    const summaries = await get('/api/projects');
    const exactNotes = '  First line\n\n\tUnicode: 雪 😀 café\n<script>alert("literal")</script> & <b>text</b>  ';
    for (const notes of [exactNotes, ' \t\n ', '', exactNotes]) {
      const response = await write(`${tasksPath}/1`, { notes });
      assert.equal(response.status, 200);
      tasks[0].notes = notes;
      assert.deepEqual(await response.json(), tasks[0]);
      assert.deepEqual(await get(tasksPath), tasks);
      assert.deepEqual(await get('/api/projects/2/tasks'), otherTasks);
      assert.deepEqual(await get('/api/projects'), summaries);
    }
    for (const notes of [null, 42, {}, false]) {
      assert.equal((await write(`${tasksPath}/1`, { notes })).status, 400);
      assert.deepEqual(await get(tasksPath), tasks);
    }
    assert.equal((await write('/api/projects/2/tasks/1', { notes: 'Wrong owner' })).status, 404);
    await write(`${tasksPath}/2`, { notes: 'Independent notes' });
    tasks[1].notes = 'Independent notes';
    await write('/api/projects/1', { archived: true });
    assert.equal((await write(`${tasksPath}/1`, { notes: '' })).status, 409);
    await stop();
    await start();
    assert.deepEqual(await get(tasksPath), tasks);
    await write('/api/projects/1', { archived: false });
    await write('/api/projects/1', { name: 'Renamed project' });
    await write(`${tasksPath}/1`, { title: 'Renamed task' });
    tasks[0].title = 'Renamed task';
    assert.equal((await write(`${tasksPath}/1`, { destination_project_id: 2 })).status, 200);
    assert.deepEqual(await get(tasksPath), tasks.slice(1));
    // This project remembers position 1 from a previous visit, before its existing task.
    assert.deepEqual(await get('/api/projects/2/tasks'), [tasks[0], ...otherTasks]);
    assert.equal((await get('/api/projects/1')).completed, 0);
    assert.equal((await get('/api/projects/2')).completed, 1);
    await write('/api/projects/2/tasks/1', { notes: '  Edited away\n雪  ' });
    tasks[0].notes = '  Edited away\n雪  ';
    await stop();
    await start();
    assert.deepEqual(await get('/api/projects/2/tasks'), [tasks[0], ...otherTasks]);
    assert.equal((await write('/api/projects/2/tasks/1', { destination_project_id: 1 })).status, 200);
    assert.deepEqual(await get(tasksPath), tasks);
    await write(`${tasksPath}/1`, { notes: '' });
    tasks[0].notes = '';
    await stop();
    await start();
    assert.deepEqual(await get(tasksPath), tasks);
    assert.deepEqual(await get('/api/projects/2/tasks'), otherTasks);
    assert.equal((await get('/api/projects/1')).completed, 1);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
