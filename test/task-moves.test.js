import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

for (const hasPositions of [false, true]) {
test(`moves remember project order, preserve data and archives, and persist (Task ${hasPositions ? '011' : '010'} migration)`, async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), 'data', 'moves-'));
  const dbPath = join(directory, 'workboard.sqlite');
  // Seed earlier schemas, including an older task that must append after a newer one.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
    title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT '');
    INSERT INTO projects (name) VALUES ('Source'), ('Destination'), ('Archived');
    UPDATE projects SET default_priority = 'Low' WHERE id = 2;
    UPDATE projects SET archived = 1 WHERE id = 3;
    INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES
      (1, 'Older dated', 1, 'High', '0001-01-01'),
      (1, 'Undated', 0, 'Normal', ''),
      (2, 'Destination existing', 0, 'Low', '9999-12-31');`);
  legacy.close();
  if (hasPositions) {
    const previous = new DatabaseSync(dbPath);
    previous.exec(`ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      UPDATE tasks SET position = CASE id WHEN 1 THEN 20 WHEN 2 THEN 10 ELSE 30 END`);
    previous.close();
  }
  const reservation = createServer();
  reservation.listen(0, '0.0.0.0');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const response = await fetch(`${base}/health`);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await delay(25); }
    }
    throw new Error(`Server failed to start: ${output}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = async path => (await fetch(base + path)).json();
  const write = (path, input, method = 'PATCH') => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  const tasks = id => get(`/api/projects/${id}/tasks`);
  const move = (source, task, destination) => write(`/api/projects/${source}/tasks/${task}`,
    { destination_project_id: destination });
  const ids = list => list.map(task => task.id);
  const sourceOrder = hasPositions ? [2, 1] : [1, 2];
  try {
    await start();
    const original = (await tasks(1)).find(task => task.id === 1);
    assert.deepEqual(ids(await tasks(1)), sourceOrder);
    for (const invalid of [1, 0, -1, 1.5, '2', null]) {
      assert.equal((await move(1, 1, invalid)).status, 400);
    }
    assert.equal((await move(1, 1, 99)).status, 404);
    assert.equal((await move(1, 1, 3)).status, 409);
    assert.equal((await move(2, 1, 1)).status, 404);
    assert.deepEqual((await tasks(1)).find(task => task.id === 1), original);
    let response = await move(1, 1, 2);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ...original, project_id: 2 });
    assert.deepEqual(ids(await tasks(1)), [2]);
    assert.deepEqual(ids(await tasks(2)), [3, 1]);
    let projects = await get('/api/projects');
    assert.deepEqual(projects.map(p => [p.completed_count, p.total_count]), [[0, 1], [1, 2], [0, 0]]);
    assert.equal((await move(1, 1, 2)).status, 404);
    const newTask = await (await write('/api/projects/2/tasks', { title: 'After move' }, 'POST')).json();
    assert.equal(newTask.priority, 'Low');
    assert.deepEqual(ids(await tasks(2)), [3, 1, newTask.id]);
    assert.equal((await write('/api/projects/2/tasks/1', { title: 'Renamed moved task' })).status, 200);
    assert.deepEqual(ids(await tasks(2)), [3, 1, newTask.id]);
    await stop();
    await start();
    assert.deepEqual(ids(await tasks(2)), [3, 1, newTask.id]);
    assert.deepEqual((await tasks(2))[1], { ...original, project_id: 2, title: 'Renamed moved task' });
    await write('/api/projects/2', { archived: true });
    assert.equal((await move(2, 1, 1)).status, 409);
    assert.equal((await move(1, 2, 2)).status, 409);
    await write('/api/projects/2', { archived: false });
    assert.equal((await move(2, 1, 1)).status, 200);
    assert.deepEqual(ids(await tasks(1)), sourceOrder);
    const blank = (await tasks(1)).find(task => task.id === 2);
    assert.equal((await move(1, 2, 2)).status, 200);
    assert.deepEqual(ids(await tasks(2)), [3, newTask.id, 2]);
    assert.deepEqual((await tasks(2))[2], { ...blank, project_id: 2 });
    await stop();
    await start();
    assert.deepEqual(ids(await tasks(1)), [1]);
    assert.deepEqual(ids(await tasks(2)), [3, newTask.id, 2]);
    projects = await get('/api/projects');
    assert.deepEqual(projects.map(p => [p.completed_count, p.total_count]), [[1, 1], [0, 3], [0, 0]]);

    // Returning in reverse order restores both projects' independent slots.
    await move(1, 1, 2);
    assert.deepEqual(ids(await tasks(2)), [3, 1, newTask.id, 2]);
    const afterDeparture = await (await write('/api/projects/1/tasks', { title: 'After absent tasks' }, 'POST')).json();
    await write('/api/projects/1', { name: 'Renamed source' });
    await write('/api/projects/2/tasks/2', { title: 'Updated away' });
    await write('/api/projects/2/tasks/2', { completed: true });
    await write('/api/projects/2/tasks/2', { priority: 'High' });
    await write('/api/projects/2/tasks/2', { due_date: '2024-02-29' });
    await stop();
    await start();
    await move(2, sourceOrder[1], 1);
    assert.deepEqual(ids(await tasks(1)), [sourceOrder[1], afterDeparture.id]);
    await move(2, sourceOrder[0], 1);
    assert.deepEqual(ids(await tasks(1)), [...sourceOrder, afterDeparture.id]);
    assert.deepEqual((await tasks(1)).find(task => task.id === 2), { ...blank, title: 'Updated away', completed: true,
      priority: 'High', due_date: '2024-02-29' });
    await move(2, 3, 1);
    assert.deepEqual(ids(await tasks(1)), [...sourceOrder, afterDeparture.id, 3]);
    await move(1, 2, 2);
    await move(1, 1, 2);
    assert.deepEqual(ids(await tasks(2)), [1, newTask.id, 2]);
    await write('/api/projects/2', { archived: true });
    assert.equal((await move(1, 3, 2)).status, 409);
    await stop();
    await start();
    await write('/api/projects/2', { archived: false });
    await move(1, 3, 2);
    assert.deepEqual(ids(await tasks(2)), [3, 1, newTask.id, 2]);
    // Established slots also precede first arrivals when every task is absent.
    await move(2, 3, 1);
    await move(2, 1, 1);
    await move(2, newTask.id, 1);
    await move(2, 2, 1);
    const fresh = await (await write('/api/projects/1/tasks', { title: 'First arrival' }, 'POST')).json();
    await move(1, fresh.id, 2);
    await move(1, 2, 2);
    await move(1, newTask.id, 2);
    await move(1, 1, 2);
    await move(1, 3, 2);
    assert.deepEqual(ids(await tasks(2)), [3, 1, newTask.id, 2, fresh.id]);
    await stop();
    await start();
    assert.deepEqual(ids(await tasks(2)), [3, 1, newTask.id, 2, fresh.id]);
    projects = await get('/api/projects');
    assert.deepEqual(projects.map(p => [p.completed_count, p.total_count]), [[0, 1], [2, 5], [0, 0]]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
}
