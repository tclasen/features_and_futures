import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';

async function withServer(run, seed) {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'tasks.sqlite') },
      stdio: 'ignore',
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('Server exited before becoming healthy');
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await delay(25); }
    }
    throw new Error('Server did not become healthy');
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
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
  const taskPath = project => `/${project.id}/tasks`;
  const move = (source, task, destination, status = 200) =>
    api(`${taskPath(source)}/${task.id}/move`, 'POST', { destinationProjectId: destination.id }, status);
  try {
    if (seed) seed(join(directory, 'tasks.sqlite'));
    await start();
    await run({ api, taskPath, move, restart: async () => { await stop(); await start(); } });
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
}

test('moves preserve data, remembered order and summaries through repeated moves and restart', async () => {
  await withServer(async ({ api, taskPath, move, restart }) => {
    const source = await api('', 'POST', { name: 'Source' }, 201);
    const destination = await api('', 'POST', { name: 'Destination' }, 201);
    const archived = await api('', 'POST', { name: 'Archived' }, 201);
    const oldest = await api(taskPath(source), 'POST', { title: 'Oldest task' }, 201);
    const remaining = await api(taskPath(source), 'POST', { title: 'Remaining task' }, 201);
    const existing = await api(taskPath(destination), 'POST', { title: 'Destination task' }, 201);
    const saved = await api(`${taskPath(source)}/${oldest.id}`, 'PATCH', {
      title: 'Renamed task', completed: true, priority: 'High', dueDate: '0001-01-01',
    });
    await api(`/${destination.id}`, 'PATCH', { defaultPriority: 'Low', name: 'Renamed destination' });
    await api(`/${archived.id}`, 'PATCH', { archived: true });
    await move(source, saved, source, 400);
    await move(source, saved, { id: 999999 }, 404);
    await move(source, saved, archived, 409);
    assert.deepEqual(await api(taskPath(source)), [saved, remaining]);
    assert.deepEqual(await move(source, saved, destination), saved);
    assert.deepEqual(await api(taskPath(source)), [remaining]);
    assert.deepEqual(await api(taskPath(destination)), [existing, saved]);
    await api(`${taskPath(source)}/${saved.id}`, 'PATCH', { title: 'Wrong owner' }, 404);
    const sourceSummary = await api(`/${source.id}`);
    const destinationSummary = await api(`/${destination.id}`);
    assert.deepEqual([sourceSummary.completedCount, sourceSummary.totalCount], [0, 1]);
    assert.deepEqual([destinationSummary.completedCount, destinationSummary.totalCount], [1, 2]);
    const newest = await api(taskPath(destination), 'POST', { title: 'New after move' }, 201);
    assert.equal(newest.priority, 'Low');
    assert.deepEqual(await api(taskPath(destination)), [existing, saved, newest]);
    await restart();
    assert.deepEqual(await api(taskPath(destination)), [existing, saved, newest]);
    assert.deepEqual(await api(taskPath(source)), [remaining]);
    await api(`/${destination.id}`, 'PATCH', { archived: true });
    await move(destination, saved, source, 409);
    await api(`/${destination.id}`, 'PATCH', { archived: false });
    await move(destination, saved, source);
    assert.deepEqual(await api(taskPath(source)), [saved, remaining]);
    await move(source, saved, destination);
    assert.deepEqual(await api(taskPath(destination)), [existing, saved, newest]);
    await move(source, remaining, destination);
    assert.deepEqual(await api(taskPath(destination)), [existing, saved, newest, remaining]);
    assert.deepEqual(await api(taskPath(source)), []);
    await restart();
    assert.deepEqual(await api(taskPath(destination)), [existing, saved, newest, remaining]);
    const summary = await api(`/${destination.id}`);
    assert.deepEqual([summary.completedCount, summary.totalCount], [1, 4]);
  });
});

test('reverse returns restore independent positions and reserve absent tasks ahead of new arrivals', async () => {
  await withServer(async ({ api, taskPath, move, restart }) => {
    const source = await api('', 'POST', { name: 'Original' }, 201);
    const destination = await api('', 'POST', { name: 'Second' }, 201);
    const third = await api('', 'POST', { name: 'Third' }, 201);
    const first = await api(taskPath(source), 'POST', { title: 'First' }, 201);
    const second = await api(taskPath(source), 'POST', { title: 'Second' }, 201);
    const last = await api(taskPath(source), 'POST', { title: 'Last' }, 201);
    await move(source, last, destination);
    await move(source, first, destination);
    await move(source, second, destination);
    assert.deepEqual(await api(taskPath(destination)), [last, first, second]);
    const created = await api(taskPath(source), 'POST', { title: 'Created while others away' }, 201);
    const arrival = await api(taskPath(third), 'POST', { title: 'First arrival' }, 201);
    await move(third, arrival, source);
    const updated = await api(`${taskPath(destination)}/${first.id}`, 'PATCH', {
      title: 'Current title', completed: true, priority: 'High', dueDate: '2024-02-29',
    });
    await api(`/${source.id}`, 'PATCH', { name: 'Renamed original', archived: true });
    await move(destination, second, source, 409);
    await restart();
    await api(`/${source.id}`, 'PATCH', { archived: false });
    // Return in reverse order, including after a process restart.
    await move(destination, last, source);
    await move(destination, second, source);
    await move(destination, updated, source);
    assert.deepEqual(await api(taskPath(source)), [updated, second, last, created, arrival]);
    // The same tasks have a different remembered order in the other project.
    await move(source, second, destination);
    await move(source, updated, destination);
    await move(source, last, destination);
    assert.deepEqual(await api(taskPath(destination)), [last, updated, second]);
    await restart();
    assert.deepEqual(await api(taskPath(destination)), [last, updated, second]);
    assert.deepEqual(await api(taskPath(source)), [created, arrival]);
    const summary = await api(`/${destination.id}`);
    assert.deepEqual([summary.completedCount, summary.totalCount], [1, 3]);
  });
});

test('upgrading preserves existing position order and remembers it across restarts', async () => {
  await withServer(async ({ api, taskPath, move, restart }) => {
    const source = { id: 1 };
    const destination = { id: 2 };
    const [first, last] = await api(taskPath(source));
    assert.deepEqual([first.title, last.title], ['Earlier position', 'Later position']);
    assert.deepEqual([first.id, last.id], [2, 1]);
    await move(source, last, destination);
    await move(source, first, destination);
    const created = await api(taskPath(source), 'POST', { title: 'New task' }, 201);
    await restart();
    await move(destination, last, source);
    await move(destination, first, source);
    assert.deepEqual(await api(taskPath(source)), [first, last, created]);
    await restart();
    assert.deepEqual(await api(taskPath(source)), [first, last, created]);
  }, path => {
    const db = new DatabaseSync(path);
    try {
      db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        INSERT INTO projects (name) VALUES ('Legacy source'), ('Legacy destination');
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
          title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL
        );
        INSERT INTO tasks (project_id, title, position) VALUES
          (1, 'Later position', 8), (1, 'Earlier position', 3)`);
    } finally { db.close(); }
  });
});
