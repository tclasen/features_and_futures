import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('moves append to destination, preserve data and summaries, reject archives, and persist through restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination'), ('Third');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Oldest', 1), (2, 'Destination first', 0),
      (1, 'Source remaining', 0), (2, 'Destination second', 1);`);
  legacy.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Startup timed out')), 5000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const done = once(child, 'exit');
    child.kill('SIGTERM');
    await done;
    child = undefined;
  }
  async function api(path, method = 'GET', body, status = 200) {
    const response = await fetch(`${base}/api/projects${path}`, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    assert.equal(response.status, status);
    return response.json();
  }
  const move = (source, task, destination, status = 200) =>
    api(`/${source}/tasks/${task}`, 'PATCH', { project_id: destination }, status);
  const ids = async (project) => (await api(`/${project}/tasks`)).map((task) => task.id);
  try {
    await start();
    assert.deepEqual(await ids(1), [1, 3]);
    assert.deepEqual(await ids(2), [2, 4]);
    await api('/1/tasks/1', 'PATCH', { priority: 'High' });
    const original = await api('/1/tasks/1', 'PATCH', { due_date: '0001-01-01' });
    await api('/2', 'PATCH', { default_priority: 'Low' });
    for (const destination of [1, 0, -1, '2', null, 2.5]) await move(1, 1, destination, 400);
    await move(1, 1, 99999, 404);
    await move(2, 1, 3, 404);
    await api('/2', 'PATCH', { archived: true });
    await move(1, 1, 2, 409);
    await api('/1', 'PATCH', { archived: true });
    await move(1, 1, 3, 409);
    assert.deepEqual(await ids(1), [1, 3]);
    await api('/1', 'PATCH', { archived: false });
    await api('/2', 'PATCH', { archived: false });
    assert.deepEqual(await move(1, 1, 2), original);
    assert.deepEqual(await ids(1), [3]);
    assert.deepEqual(await ids(2), [2, 4, 1]);
    const added = await api('/2/tasks', 'POST', { title: 'Created after move' }, 201);
    assert.equal(added.priority, 'Low');
    assert.deepEqual(await ids(2), [2, 4, 1, added.id]);
    const summaries = await api('');
    assert.deepEqual(summaries.map(({ total, completed }) => [completed, total]), [[0, 1], [2, 4], [0, 0]]);
    await stop();
    await start();
    assert.deepEqual(await api(''), summaries);
    assert.deepEqual((await api('/2/tasks'))[2], original);
    assert.deepEqual(await move(2, 1, 3), original);
    assert.deepEqual(await move(3, 1, 1), original);
    assert.deepEqual(await ids(1), [3, 1]);
    const blankDateTask = (await api('/2/tasks'))[0];
    assert.deepEqual(await move(2, blankDateTask.id, 1), blankDateTask);
    assert.deepEqual(await ids(1), [3, 1, 2]);
    await api('/1/tasks/1', 'PATCH', { title: 'Renamed moved task' });
    await stop();
    await start();
    assert.deepEqual(await ids(1), [3, 1, 2]);
    assert.deepEqual((await api('/1/tasks'))[1], { ...original, title: 'Renamed moved task' });
    assert.deepEqual(await ids(2), [4, added.id]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
