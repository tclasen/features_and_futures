import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('remembered project positions migrate, survive reverse returns, and persist with current task data', { timeout: 15000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-order-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  // Existing movement order differs from task IDs: migration must use position.
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('A'), ('B'), ('C');
    INSERT INTO tasks (project_id, title, position) VALUES
      (1, 'Last', 30), (1, 'First', 10), (1, 'Middle', 20), (2, 'B resident', 5);
  `);
  legacy.close();
  let child;
  let base;
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  t.after(async () => {
    await stop();
    await rm(directory, { recursive: true, force: true });
  });
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: databasePath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      let output = '';
      let errors = '';
      child.stderr.on('data', (chunk) => { errors += chunk; });
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Server exited: ${code}\n${errors}`)));
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) {
          base = `http://127.0.0.1:${match[1]}`;
          resolve();
        }
      });
    });
  }
  async function request(path, method = 'GET', body, status = 200) {
    const response = await fetch(`${base}/api/projects${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, status);
    return response.json();
  }
  const tasks = (project) => request(`/${project}/tasks`);
  const ids = async (project) => (await tasks(project)).map((task) => task.id);
  const move = (source, task, destination, status = 200) => request(
    `/${source}/tasks/${task}`, 'PATCH', { destination_project_id: destination }, status);
  const edit = (project, task, body) => request(`/${project}/tasks/${task}`, 'PATCH', body);

  await start();
  assert.deepEqual(await ids(1), [2, 3, 1]);
  // Even when the last task leaves, its slot remains before subsequent creations.
  await move(1, 1, 2);
  const created = await request('/1/tasks', 'POST', { title: 'New A task' }, 201);
  await move(1, 2, 2);
  await move(1, 3, 2);
  assert.deepEqual(await ids(1), [created.id]);
  assert.deepEqual(await ids(2), [4, 1, 2, 3]);
  await edit(2, 2, { title: 'Renamed while away' });
  await edit(2, 2, { completed: true });
  await edit(2, 2, { priority: 'High' });
  const updated = await edit(2, 2, { due_date: '2024-02-29' });
  await request('/1', 'PATCH', { default_task_priority: 'Low' });
  await request('/1', 'PATCH', { name: 'Renamed A' });
  await request('/1', 'PATCH', { archived: true });
  await move(2, 3, 1, 409);
  assert.deepEqual(await ids(2), [4, 1, 2, 3]);
  await stop();
  await start();
  await request('/1', 'PATCH', { archived: false });
  // Return in reverse order across a restart, retaining today's field values.
  await move(2, 3, 1);
  await stop();
  await start();
  await move(2, 2, 1);
  await move(2, 1, 1);
  assert.deepEqual(await ids(1), [2, 3, 1, created.id]);
  assert.deepEqual((await tasks(1))[0], { ...updated, project_id: 1 });
  assert.equal((await tasks(1))[2].due_date, '');
  assert.deepEqual(await ids(2), [4]);
  const a = await request('/1');
  const b = await request('/2');
  assert.equal(a.total_count, 4);
  assert.equal(a.completed_count, 1);
  assert.equal(b.total_count, 1);
  assert.equal(b.completed_count, 0);

  // B remembers its own arrival order, independently of A's original order.
  await move(1, 3, 2);
  await move(1, 2, 2);
  await move(1, 1, 2);
  assert.deepEqual(await ids(2), [4, 1, 2, 3]);
  await move(2, 2, 3);
  await move(2, 1, 3);
  assert.deepEqual(await ids(3), [2, 1]);
  // New tasks and first arrivals come after slots whose owners are away.
  const newB = await request('/2/tasks', 'POST', { title: 'New B task' }, 201);
  await move(1, created.id, 2);
  assert.deepEqual(await ids(2), [4, 3, newB.id, created.id]);
  await move(3, 2, 2);
  await move(3, 1, 2);
  assert.deepEqual(await ids(2), [4, 1, 2, 3, newB.id, created.id]);
  await stop();
  await start();
  assert.deepEqual(await ids(2), [4, 1, 2, 3, newB.id, created.id]);
  assert.deepEqual((await tasks(2))[2], updated);
  // Returning to C restores its own earlier positions too.
  await move(2, 1, 3);
  await move(2, 2, 3);
  assert.deepEqual(await ids(3), [2, 1]);
});
