import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('legacy order migrates and multiple returns restore durable per-project slots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-order-'));
  const dbPath = join(directory, 'db.sqlite');
  const port = 20000 + Math.floor(Math.random() * 30000);
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server not healthy');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const send = async (path, body, method = 'PATCH') => {
    const response = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.ok(response.ok, await response.clone().text());
    return response.json();
  };
  const tasks = project => `/api/projects/${project}/tasks`;
  const get = async path => (await fetch(base + path)).json();
  const ids = async project => (await get(tasks(project))).map(task => task.id);
  const move = (task, source, destination) => send(`${tasks(source)}/${task}`, { destination_project_id: destination });
  try {
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      INSERT INTO projects VALUES (1, 'A'), (2, 'B'), (3, 'C');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL);
      INSERT INTO tasks VALUES (1, 1, 'First', 0, 30), (2, 1, 'Second', 0, 10),
        (3, 1, 'Third', 1, 20), (4, 2, 'Resident', 0, 40);`);
    legacy.close();
    await start();
    assert.deepEqual(await ids(1), [2, 3, 1]);
    await move(2, 1, 2);
    await move(3, 1, 2);
    assert.deepEqual(await ids(2), [4, 2, 3]);
    // New tasks must come after remembered positions, even if their occupants left.
    await move(1, 1, 3);
    const created = await send(tasks(1), { title: 'New' }, 'POST');
    await send(`${tasks(2)}/2`, { title: 'Current title' });
    await send(`${tasks(2)}/2`, { priority: 'High' });
    await send(`${tasks(2)}/2`, { completed: true });
    await send(`${tasks(2)}/2`, { due_date: '2028-02-29' });
    await send('/api/projects/1', { name: 'Renamed A' });
    await send('/api/projects/1', { archived: true });
    await stop();
    await start();
    await send('/api/projects/1', { archived: false });
    await move(1, 3, 1);
    await move(3, 2, 1);
    const returned = await move(2, 2, 1);
    assert.deepEqual(await ids(1), [2, 3, 1, created.id]);
    assert.equal(returned.title, 'Current title');
    assert.equal(returned.completed, true);
    assert.equal(returned.priority, 'High');
    assert.equal(returned.due_date, '2028-02-29');
    // B also remembers its original arrival order regardless of return sequence.
    await move(3, 1, 2);
    await move(2, 1, 2);
    assert.deepEqual(await ids(2), [4, 2, 3]);
    await move(4, 2, 3);
    const newArrival = await send(tasks(2), { title: 'After established slots' }, 'POST');
    await stop();
    await start();
    await move(4, 3, 2);
    assert.deepEqual(await ids(2), [4, 2, 3, newArrival.id]);
    const projects = await get('/api/projects');
    assert.equal(projects[1].total, 4);
    assert.equal(projects[1].completed, 2);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
