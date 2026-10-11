import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('soft deletion preserves data, reserved order, filters, summaries and archive restrictions across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO projects VALUES (1, 'Source'), (2, 'Destination');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT, notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO tasks VALUES (1, 1, 'First', 1, 'High', '2025-03-02', '  preserved\n雪 <b>notes</b> ', 4),
      (2, 1, 'Second', 0, 'Normal', NULL, '', 5);
  `);
  const before = { ...legacy.prepare('SELECT * FROM tasks WHERE id = 1').get(), deleted: 0 };
  legacy.close();
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
      try { if ((await fetch(`${base}/health`)).status === 200) return; }
      catch { /* Wait for startup. */ }
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
  function savedTask(id = 1) {
    const db = new DatabaseSync(dbPath);
    try { return { ...db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) }; }
    finally { db.close(); }
  }
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const page = async (path = '/projects/1') => (await fetch(base + path)).text();
  const rows = (html) => [...html.matchAll(/<li data-testid="task-row">[\s\S]*?<\/li>/g)].map((match) => match[0]);
  const titles = (html) => rows(html).map((row) => row.match(/<span>(.*?)<\/span>/)[1]);
  try {
    await start();
    assert.deepEqual(savedTask(), before);
    assert.equal(savedTask(2).deleted, 0);
    assert.deepEqual(titles(await page()), ['First', 'Second']);
    assert.match(await page(), /<option>Deleted<\/option>/);
    assert.deepEqual(titles(await page('/projects/1?filter=Deleted')), []);
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2025-03-01',
      dueThrough: '2025-03-03', search: 'first' };
    const response = await post('/projects/1/tasks/1/delete', filters);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High&dueFrom=2025-03-01&dueThrough=2025-03-03&search=first');
    assert.deepEqual(titles(await page(response.headers.get('location'))), []);
    assert.deepEqual(savedTask(), { ...before, deleted: 1 });
    assert.deepEqual(titles(await page()), ['Second']);
    assert.match(await page('/'), /project-summary">0\/1 completed/);
    const deletedUrl = '/projects/1?filter=Deleted&priorityFilter=High&dueFrom=2025-03-02&dueThrough=2025-03-02&search=FIRST';
    const deleted = await page(deletedUrl);
    assert.deepEqual(titles(deleted), ['First']);
    assert.match(deleted, /Restore task/);
    assert.doesNotMatch(deleted, />Delete task</);
    for (const control of rows(deleted)[0].matchAll(/<(input|select|textarea|button)\b[^>]*>/g)) {
      // The sole enabled button is Restore task, checked separately below.
      if (/type="hidden"/.test(control[0]) || control[0].startsWith('<button')) continue;
      assert.match(control[0], /disabled/, control[0]);
    }
    const buttons = [...rows(deleted)[0].matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)];
    for (const [, attributes, label] of buttons) {
      if (label === 'Restore task') assert.doesNotMatch(attributes, /disabled/);
      else assert.match(attributes, /disabled/, label);
    }
    for (const query of ['priorityFilter=Low', 'dueFrom=2025-03-03', 'dueThrough=2025-03-01', 'search=notes']) {
      assert.deepEqual(titles(await page(`/projects/1?filter=Deleted&${query}`)), []);
    }
    for (const [action, values] of Object.entries({ completion: {}, priority: { priority: 'Low' },
      rename: { title: 'Changed' }, 'due-date': { dueDate: '' }, notes: { notes: '' }, move: { destination: '2' } })) {
      assert.equal((await post(`/projects/1/tasks/1/${action}`, values)).status, 403);
    }
    assert.deepEqual(savedTask(), { ...before, deleted: 1 });
    assert.equal((await post('/projects/2/tasks/1/restore')).status, 404);
    await post('/projects/1/tasks/2/delete');
    assert.match(await page('/'), /project-summary">0\/0 completed/);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Third', filter: 'Deleted' });
    assert.equal(savedTask(3).deleted, 0);
    assert.equal(savedTask(3).priority, 'Low');
    await stop();
    await start();
    assert.deepEqual(savedTask(), { ...before, deleted: 1 });
    assert.deepEqual(titles(await page('/projects/1?filter=Deleted')), ['First', 'Second']);
    await post('/projects/1/archive');
    const archived = await page(deletedUrl);
    assert.deepEqual(titles(archived), ['First']);
    assert.match(archived, /<button type="submit" disabled>Restore task/);
    assert.match(await page(), /<button type="submit" disabled>Delete task/);
    assert.equal((await post('/projects/1/tasks/1/restore')).status, 403);
    assert.equal((await post('/projects/1/tasks/3/delete')).status, 403);
    await post('/projects/1/restore');
    await post('/projects/1/tasks/2/restore', { filter: 'Deleted' });
    const restored = await post('/projects/1/tasks/1/restore', { ...filters, filter: 'Deleted' });
    assert.match(restored.headers.get('location'), /filter=Deleted&priorityFilter=High/);
    assert.deepEqual(titles(await page(restored.headers.get('location'))), []);
    assert.deepEqual(savedTask(), before);
    assert.deepEqual(titles(await page()), ['First', 'Second', 'Third']);
    assert.deepEqual(titles(await page('/projects/1?filter=Completed')), ['First']);
    assert.deepEqual(titles(await page('/projects/1?filter=Open')), ['Second', 'Third']);
    assert.match(await page('/'), /project-summary">1\/3 completed/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/delete');
    await post('/projects/2/tasks', { title: 'Destination new' });
    await post('/projects/2/tasks/1/restore');
    assert.deepEqual(titles(await page('/projects/2')), ['First', 'Destination new']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(savedTask(), before);
    assert.deepEqual(titles(await page()), ['First', 'Second', 'Third']);
    await stop();
    await start();
    assert.deepEqual(savedTask(), before);
    assert.deepEqual(titles(await page()), ['First', 'Second', 'Third']);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
