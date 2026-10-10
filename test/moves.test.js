import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('moves append tasks, preserve data and filters, enforce active ownership, and survive restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const databasePath = join(directory, 'moves.sqlite');
  // Model the Task 010 database, including older task IDs than destination tasks.
  const db = new DatabaseSync(databasePath);
  db.exec(`CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal'
  );
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'Normal', due_date TEXT NOT NULL DEFAULT ''
  );
  INSERT INTO projects (name, default_priority) VALUES ('Source', 'Normal'), ('Destination', 'Low');
  INSERT INTO projects (name, archived) VALUES ('Archived', 1);
  INSERT INTO tasks (project_id, title, completed, priority, due_date) VALUES
    (1, 'Move dated', 1, 'High', '2026-10-10'),
    (1, 'Move undated', 0, 'Normal', ''),
    (1, 'Remain dated', 1, 'High', '2026-10-11'),
    (2, 'Destination existing', 0, 'Low', '');`);
  const original = db.prepare('SELECT * FROM tasks ORDER BY id').all();
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: databasePath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${base}/health`);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        if (child.exitCode !== null) throw new Error(output);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    throw new Error(`Server did not start: ${output}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const post = (path, body = {}) => fetch(`${base}${path}`, {
    method: 'POST', body: new URLSearchParams(body), redirect: 'manual',
  });
  const html = async path => (await fetch(`${base}${path}`)).text();
  const rows = page => page.match(/<div class="task-row"[\s\S]*?<\/div>(?=\s*<div class="task-row"|\s*<\/section>)/g) || [];
  const ids = page => rows(page).map(row => Number(/action="\/projects\/\d+\/tasks\/(\d+)"/.exec(row)[1]));
  const destinations = page => [...page.matchAll(/<select id="destination-project-\d+"([^>]*)>([\s\S]*?)<\/select>/g)];
  const range = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2026-10-10', dueThrough: '2026-10-11' };
  const sourceUrl = `/projects/1?${new URLSearchParams(range)}`;
  const assertRange = page => {
    assert.match(page, /<option selected>Completed<\/option>/);
    assert.match(page, /<option selected>High<\/option>/);
    assert.match(page, /id="due-from"[^>]*value="2026-10-10"/);
    assert.match(page, /id="due-through"[^>]*value="2026-10-11"/);
  };
  function saved(id) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    const { position, ...data } = task;
    return { ...data };
  }
  try {
    await start();
    assert.deepEqual(ids(await html('/projects/1')), [1, 2, 3]);
    assert.deepEqual(ids(await html('/projects/2')), [4]);
    assert.ok(destinations(await html('/projects/1')).every(select =>
      !select[1].includes('disabled') && select[2].trim() === '<option value="2">Destination</option>'));
    await post('/projects/2/rename', { name: 'Renamed <destination>' });
    await post('/projects', { name: 'Third' });
    assert.ok(destinations(await html('/projects/1')).every(select =>
      select[2].trim() === '<option value="2">Renamed &lt;destination&gt;</option><option value="4">Third</option>'));
    const before = await html(sourceUrl);
    for (const destinationProject of ['', '1', '3', '9999', '2.5', 'NaN']) {
      assert.equal((await post('/projects/1/tasks/1/move', { ...range, destinationProject })).status, 422);
      assert.equal(await html(sourceUrl), before);
    }
    assert.equal((await post('/projects/2/tasks/1/move', { destinationProject: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/9999/move', { destinationProject: '2' })).status, 404);
    const response = await post('/projects/1/tasks/1/move', { ...range, destinationProject: '2' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), sourceUrl);
    const sourceAfter = await html(response.headers.get('location'));
    assertRange(sourceAfter);
    assert.deepEqual(ids(sourceAfter), [3]);
    assert.deepEqual(ids(await html('/projects/1')), [2, 3]);
    assert.deepEqual(ids(await html('/projects/2')), [4, 1]);
    assert.deepEqual(saved(1), { ...original[0], project_id: 2 });
    assert.match(await html('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/1/tasks/1', { completed: '0' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/move', { destinationProject: '4' })).status, 404);
    // New tasks still append after moved tasks, and moved tasks can move again.
    await post('/projects/2/tasks', { title: 'New destination task' });
    assert.deepEqual(ids(await html('/projects/2')), [4, 1, 5]);
    assert.equal(saved(5).priority, 'Low');
    await post('/projects/1/tasks/2/move', { destinationProject: '2' });
    assert.deepEqual(ids(await html('/projects/2')), [4, 1, 5, 2]);
    assert.deepEqual(saved(2), { ...original[1], project_id: 2 });
    await post('/projects/2/tasks/1/move', { destinationProject: '1' });
    assert.deepEqual(ids(await html('/projects/1')), [3, 1]);
    assert.deepEqual(saved(1), { ...original[0] });
    assert.deepEqual(ids(await html('/projects/2')), [4, 5, 2]);
    const summaries = await html('/');
    assert.match(summaries, /data-testid="project-summary">2\/2 completed/);
    assert.match(summaries, /data-testid="project-summary">0\/3 completed/);
    const savedSource = await html(sourceUrl);
    const savedDestination = await html('/projects/2');
    await stop();
    await start();
    assert.equal(await html(sourceUrl), savedSource);
    assert.equal(await html('/projects/2'), savedDestination);
    assert.equal(await html('/'), summaries);
    await post('/projects/1/archive');
    const archived = await html(sourceUrl);
    assertRange(archived);
    assert.ok(destinations(archived).every(select => select[1].includes('disabled')));
    assert.ok(rows(archived).every(row => /<button type="submit" disabled>Move task<\/button>/.test(row)));
    assert.equal((await post('/projects/1/tasks/1/move', { destinationProject: '2' })).status, 403);
    assert.equal((await post('/projects/2/tasks/2/move', { destinationProject: '1' })).status, 422);
    assert.ok(destinations(await html('/projects/2')).every(select =>
      select[2].trim() === '<option value="4">Third</option>'));
    await stop();
    await start();
    assert.equal(await html(sourceUrl), archived);
    await post('/projects/1/restore');
    assert.equal(await html(sourceUrl), savedSource);
    // With no other active projects, controls contain no options and are disabled.
    await post('/projects/2/archive');
    await post('/projects/4/archive');
    const noDestinations = await html('/projects/1');
    assert.ok(destinations(noDestinations).every(select => select[1].includes('disabled') && !select[2].trim()));
    assert.ok(rows(noDestinations).every(row => /<button type="submit" disabled>Move task<\/button>/.test(row)));
    await post('/projects/2/restore');
    assert.ok(destinations(await html('/projects/1')).every(select => !select[1].includes('disabled')));
    await post('/projects/1/tasks/1/move', { destinationProject: '2' });
    assert.deepEqual(ids(await html('/projects/2')), [4, 5, 2, 1]);
    assert.deepEqual(saved(1), { ...original[0], project_id: 2 });
  } finally {
    await stop();
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
