import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('migrated order and independent return positions survive edits, archives, and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-order-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL
    );
    INSERT INTO projects (id, name) VALUES (1, 'Source'), (2, 'Destination'), (3, 'Third');
    INSERT INTO tasks (id, project_id, title, position) VALUES
      (1, 1, 'B', 20), (2, 1, 'A', 10), (3, 1, 'C', 30), (4, 2, 'D', 5);
  `);
  legacy.close();
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let diagnostics = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: databasePath },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', (chunk) => { diagnostics += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(diagnostics);
      try {
        const response = await fetch(`${base}/health`);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await new Promise((resolve) => setTimeout(resolve, 25)); }
    }
    throw new Error(`Server did not start: ${diagnostics}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function write(path, body, status = 200, method = 'PATCH') {
    const response = await fetch(`${base}/api/projects/${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, status);
    return response.json();
  }
  const move = (source, task, destination, status) =>
    write(`${source}/tasks/${task}`, { destination_project_id: destination }, status);
  const tasks = async (project) => (await fetch(`${base}/api/projects/${project}/tasks`)).json();
  const order = async (project, expected) => assert.deepEqual((await tasks(project)).map((task) => task.id), expected);
  try {
    await start();
    await order(1, [2, 1, 3]); // Migration preserves position order, not ID order.
    assert.ok((await tasks(1)).every((task) => task.notes === ''));
    const originalTask = (await tasks(1))[0];
    const notes = '  First line\n\t第二行 📝\n<script>alert("literal")</script> & <b>text</b>  \n';
    const withNotes = await write('1/tasks/2', { notes });
    assert.deepEqual(withNotes, { ...originalTask, notes });
    assert.ok((await tasks(1)).slice(1).every((task) => task.notes === ''));
    await write('1/tasks/2', { notes: '' });
    assert.deepEqual((await tasks(1))[0], originalTask);
    await write('1/tasks/2', { notes });
    await write('1/tasks/2', { notes: null }, 400);
    assert.deepEqual((await tasks(1))[0], withNotes);
    await move(1, 2, 2);
    await move(1, 3, 2);
    await order(2, [4, 2, 3]);
    await write('2/tasks/2', { title: '  Current A  ' });
    await write('2/tasks/2', { completed: true });
    await write('2/tasks/2', { priority: 'High' });
    await write('2/tasks/2', { due_date: '2028-02-29' });
    const currentA = (await tasks(2)).find((task) => task.id === 2);
    await write('1', { name: 'Renamed source' });
    await write('1', { archived: true });
    await move(2, 2, 1, 409);
    await stop();
    await start();
    await write('1', { archived: false });
    await move(2, 3, 1); // Return in reverse order.
    const created = await write('1/tasks', { title: 'New' }, 201, 'POST');
    await move(2, 2, 1);
    await order(1, [2, 1, 3, created.id]);
    assert.deepEqual((await tasks(1))[0], currentA);
    await move(1, 3, 2);
    await move(1, 2, 2);
    await order(2, [4, 2, 3]); // Destination remembers its own different order.
    await move(2, 2, 3);
    await move(2, 3, 3);
    await order(3, [2, 3]);
    await move(3, 2, 1);
    await move(3, 3, 1);
    const arrival = await write('3/tasks', { title: 'First arrival' }, 201, 'POST');
    await move(3, arrival.id, 1);
    await order(1, [2, 1, 3, created.id, arrival.id]);
    // Empty projects still reserve departed tasks' positions for future returns.
    const thirdNew = await write('3/tasks', { title: 'After reserved positions' }, 201, 'POST');
    await stop();
    await start();
    await move(1, 3, 3);
    await move(1, 2, 3);
    await order(3, [2, 3, thirdNew.id]);
    assert.deepEqual((await tasks(3))[0], currentA);
    await write('3', { archived: true });
    await write('3/tasks/2', { notes: 'blocked' }, 409);
    assert.deepEqual((await tasks(3))[0], currentA);
    await move(3, 2, 1, 409);
    const projects = await (await fetch(`${base}/api/projects`)).json();
    assert.deepEqual(projects.map(({ total, completed }) => ({ total, completed })), [
      { total: 3, completed: 0 }, { total: 1, completed: 0 }, { total: 3, completed: 1 },
    ]);
    await stop();
    await start();
    await write('3', { archived: false });
    const updatedNotes = '  Updated\nnotes Ω  ';
    await write('3/tasks/2', { notes: updatedNotes });
    await move(3, 2, 1);
    await move(3, 3, 1);
    await order(1, [2, 1, 3, created.id, arrival.id]);
    assert.deepEqual((await tasks(1))[0], { ...currentA, notes: updatedNotes });
    await stop();
    await start();
    assert.deepEqual((await tasks(1))[0], { ...currentA, notes: updatedNotes });
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
