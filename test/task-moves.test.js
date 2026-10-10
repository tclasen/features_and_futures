import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('moves migrate ordering, remember return positions, preserve data and summaries across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const path = join(directory, 'db.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects VALUES (1, 'Source'), (2, 'Destination'), (3, 'Archived');
    INSERT INTO tasks VALUES (1, 1, 'Oldest', 1), (2, 1, 'Remaining', 0), (3, 2, 'Destination first', 0);`);
  db.close();
  const port = 20000 + Math.floor(Math.random() * 20000);
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), DB_PATH: path }, stdio: ['ignore', 'ignore', 'inherit'] });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Server not healthy');
  }
  async function stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; child = undefined; }
  async function api(path, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  const patchProject = (id, body) => api(`/projects/${id}`, 'PATCH', body);
  const patchTask = (project, id, body) => api(`/projects/${project}/tasks/${id}`, 'PATCH', body);
  const move = (source, id, destination) => patchTask(source, id, { destination_project_id: destination });
  const tasks = async id => (await api(`/projects/${id}/tasks`)).data;
  try {
    await start();
    await patchProject(3, { archived: true });
    await patchProject(2, { default_priority: 'Low' });
    await patchTask(1, 1, { priority: 'High' });
    await patchTask(1, 1, { due_date: '0001-01-01' });
    const original = (await tasks(1))[0];
    for (const invalid of [1, null, '2', 0]) assert.equal((await move(1, 1, invalid)).status, invalid === 0 ? 404 : 400);
    assert.equal((await move(1, 1, 3)).status, 409);
    assert.equal((await move(2, 1, 1)).status, 404);
    assert.equal((await move(1, 1, 2)).status, 200);
    assert.deepEqual((await tasks(1)).map(task => task.id), [2]);
    const destinationTasks = await tasks(2);
    assert.deepEqual(destinationTasks.map(task => task.id), [3, 1]);
    assert.deepEqual(destinationTasks[1], { ...original, project_id: 2 });
    const added = (await api('/projects/2/tasks', 'POST', { title: 'Later' })).data;
    assert.equal(added.priority, 'Low');
    assert.deepEqual((await tasks(2)).map(task => task.id), [3, 1, added.id]);
    let summaries = (await api('/projects')).data;
    assert.deepEqual(summaries.slice(0, 2).map(p => [p.completed, p.total]), [[0, 1], [1, 3]]);
    await patchProject(2, { archived: true });
    assert.equal((await move(2, 1, 1)).status, 409);
    await stop();
    await start();
    assert.deepEqual((await tasks(2)).map(task => task.id), [3, 1, added.id]);
    assert.deepEqual((await tasks(2))[1], { ...original, project_id: 2 });
    await patchProject(2, { archived: false });
    await patchProject(2, { name: 'Renamed destination' });
    assert.equal((await move(2, 1, 1)).status, 200);
    assert.deepEqual((await tasks(1)).map(task => task.id), [1, 2]);
    assert.deepEqual((await tasks(1))[0], original);
    assert.equal((await move(1, 2, 2)).status, 200);
    assert.deepEqual((await tasks(2)).map(task => task.id), [3, added.id, 2]);
    assert.equal((await tasks(2)).at(-1).due_date, '');
    summaries = (await api('/projects')).data;
    assert.deepEqual(summaries.slice(0, 2).map(p => [p.completed, p.total]), [[1, 1], [0, 3]]);
    await stop();
    await start();
    assert.deepEqual((await tasks(2)).map(task => task.id), [3, added.id, 2]);

    // Returning to a destination restores its first-visit position, not its task ID.
    await move(1, 1, 2);
    assert.deepEqual((await tasks(2)).map(task => task.id), [3, 1, added.id, 2]);
    await move(2, 1, 1);
    await move(2, 3, 1);
    await move(2, added.id, 1);
    await move(2, 2, 1);
    assert.deepEqual((await tasks(1)).map(task => task.id), [1, 2, 3, added.id]);
    // Empty projects still reserve all previously established positions.
    const latest = (await api('/projects/2/tasks', 'POST', { title: 'Newest' })).data;
    await patchTask(1, 1, { title: 'Current title' });
    await patchTask(1, 1, { completed: false });
    await patchTask(1, 1, { priority: 'Low' });
    await patchTask(1, 1, { due_date: '' });
    await patchProject(2, { archived: true });
    assert.equal((await move(1, 1, 2)).status, 409);
    await stop();
    await start();
    await patchProject(2, { archived: false });
    // Return in reverse order, with a restart halfway through.
    await move(1, 2, 2);
    await move(1, added.id, 2);
    assert.deepEqual((await tasks(2)).map(task => task.id), [added.id, 2, latest.id]);
    await stop();
    await start();
    await move(1, 1, 2);
    await move(1, 3, 2);
    assert.deepEqual((await tasks(2)).map(task => task.id), [3, 1, added.id, 2, latest.id]);
    assert.deepEqual((await tasks(2))[1], {
      ...original, project_id: 2, title: 'Current title', completed: false, priority: 'Low', due_date: ''
    });
    await move(2, latest.id, 1);
    const newSource = (await api('/projects/1/tasks', 'POST', { title: 'New source task' })).data;
    await move(2, added.id, 1);
    await move(2, 3, 1);
    await move(2, 2, 1);
    await move(2, 1, 1);
    assert.deepEqual((await tasks(1)).map(task => task.id), [1, 2, 3, added.id, latest.id, newSource.id]);
    await stop();
    await start();
    assert.deepEqual((await tasks(1)).map(task => task.id), [1, 2, 3, added.id, latest.id, newSource.id]);
    summaries = (await api('/projects')).data;
    assert.deepEqual(summaries.slice(0, 2).map(p => [p.completed, p.total]), [[0, 6], [0, 0]]);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
