import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('moves append, preserve task data and filters, validate ownership, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const dbPath = join(directory, 'db.sqlite');
  const listener = net.createServer().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        if ((await fetch(`${base}/health`)).status === 200) return;
      } catch { /* Wait for the server to listen. */ }
      if (child.exitCode !== null) throw new Error(output);
      await new Promise((resolve) => setTimeout(resolve, 25));
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
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const page = async (id, query = '') => (await fetch(`${base}/projects/${id}${query}`)).text();
  const rows = (html) => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map((match) => match[1]);
  const titles = (html) => rows(html).map((row) => row.match(/<span>(.*?)<\/span>/)[1]);
  const destinations = (row) => row.match(/name="destination"[^>]*>([\s\S]*?)<\/select>/)[1].trim();
  const savedTask = (id) => {
    const db = new DatabaseSync(dbPath);
    try {
      return { ...db.prepare('SELECT id, project_id, title, completed, priority, due_date FROM tasks WHERE id = ?').get(id) };
    } finally { db.close(); }
  };
  try {
    await start();
    await post('/projects', { name: 'Source' });
    await post('/projects/1/tasks', { title: 'Moved' });
    let row = rows(await page(1))[0];
    assert.equal(destinations(row), '');
    assert.match(row, /name="destination" disabled/);
    assert.match(row, /<button type="submit" disabled>Move task/);
    await post('/projects', { name: 'Destination' });
    await post('/projects', { name: 'Archived' });
    await post('/projects', { name: 'Other <project>' });
    await post('/projects/3/archive');
    await post('/projects/2/rename', { name: 'Renamed destination' });
    row = rows(await page(1))[0];
    assert.equal(destinations(row), '<option value="2">Renamed destination</option><option value="4">Other &lt;project&gt;</option>');
    assert.doesNotMatch(row, /name="destination" disabled/);
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2025-03-02' });
    await post('/projects/1/tasks', { title: 'Remaining' });
    await post('/projects/1/tasks/2/completion', { completed: '1' });
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/due-date', { dueDate: '2025-03-02' });
    // Destination tasks have newer IDs; the older moved task must still append.
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/2/tasks', { title: 'Destination second' });
    const before = savedTask(1);
    for (const destination of ['', '1', '3', '999', '2.5']) {
      assert.equal((await post('/projects/1/tasks/1/move', { destination })).status, 400);
      assert.deepEqual(savedTask(1), before);
    }
    assert.equal((await post('/projects/4/tasks/1/move', { destination: '2' })).status, 404);
    assert.deepEqual(savedTask(1), before);
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2025-03-01', dueThrough: '2025-03-03' };
    const moved = await post('/projects/1/tasks/1/move', { destination: '2', ...filters });
    assert.equal(moved.status, 303);
    assert.equal(moved.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2025-03-01&dueThrough=2025-03-03');
    const source = await (await fetch(base + moved.headers.get('location'))).text();
    assert.deepEqual(titles(source), ['Remaining']);
    assert.match(source, /<option selected>Completed/);
    assert.match(source, /<option selected>High/);
    assert.match(source, /name="from" type="text" value="2025-03-01"/);
    assert.deepEqual(titles(await page(2)), ['Destination first', 'Destination second', 'Moved']);
    assert.deepEqual(savedTask(1), { ...before, project_id: 2 });
    const list = await (await fetch(base)).text();
    assert.match(list, /<span>Source<\/span>\s*<span data-testid="project-summary">1\/1 completed/);
    assert.match(list, /<span>Renamed destination<\/span>\s*<span data-testid="project-summary">1\/3 completed/);
    await post('/projects/2/tasks', { title: 'After move' });
    assert.deepEqual(titles(await page(2)), ['Destination first', 'Destination second', 'Moved', 'After move']);
    await stop();
    await start();
    assert.deepEqual(savedTask(1), { ...before, project_id: 2 });
    assert.deepEqual(titles(await page(2)), ['Destination first', 'Destination second', 'Moved', 'After move']);
    await post('/projects/2/archive');
    row = rows(await page(2))[2];
    assert.match(row, /name="destination" disabled/);
    assert.match(row, /<button type="submit" disabled>Move task/);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 403);
    assert.equal((await post('/projects/1/tasks/2/move', { destination: '2' })).status, 400);
    assert.deepEqual(savedTask(1), { ...before, project_id: 2 });
    await post('/projects/2/restore');
    assert.doesNotMatch(rows(await page(2))[2], /name="destination" disabled/);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 303);
    assert.deepEqual(titles(await page(1)), ['Remaining', 'Moved']);
    assert.deepEqual(savedTask(1), before);
    // Blank dates and inherited priorities also survive moves, independent of defaults.
    const blank = savedTask(3);
    assert.equal((await post('/projects/2/tasks/3/move', { destination: '1' })).status, 303);
    assert.deepEqual(savedTask(3), { ...blank, project_id: 1 });
    assert.deepEqual(titles(await page(1)), ['Remaining', 'Moved', 'Destination first']);
    await stop();
    await start();
    assert.deepEqual(titles(await page(1)), ['Remaining', 'Moved', 'Destination first']);
    assert.deepEqual(savedTask(3), { ...blank, project_id: 1 });
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
