import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('directory is read-only, intersects filters, preserves order and displays literal fields across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-'));
  const dbPath = join(directory, 'db.sqlite');
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.on('error', reject);
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  }
  async function stop() { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; child = null; }
  const post = (path, body = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(body), redirect: 'manual' });
  const get = async path => (await fetch(base + path)).text();
  const rows = html => [...html.matchAll(/data-testid="directory-task-title"[^>]*>(.*?)<\/span>/gs)].map(match => match[1]);
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    try { return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); }
    finally { db.close(); }
  };
  const task = (title, overrides = {}) => ({ title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false, ...overrides });
  async function imported(name, archived, tasks) {
    await post('/projects/import', { name, json: JSON.stringify({ format: 'workboard-project', version: 1, project: { name, archived, defaultPriority: 'High', tasks } }) });
  }
  try {
    await start();
    await imported('Owner needle', false, [
      task('First\t  NEEDLE', { completed: true, priority: 'High', dueDate: '2024-02-29', notes: '  <b>日本語</b>\n next  ' }),
      task('Deleted early', { deleted: true, priority: 'Low', dueDate: '0001-01-01' }),
      task('Undated', { notes: 'needle' }),
      task('Deleted late', { deleted: true, completed: true })
    ]);
    await imported('Second', false, [task('Second task', { priority: 'High', dueDate: '2024-03-01' })]);
    await imported('Archived owner', true, [task('Archived task'), task('Archived deleted', { deleted: true })]);
    const before = snapshot();
    assert.match(await get('/'), /action="\/directory"><button type="submit">Task directory/);
    const initial = await get('/directory');
    assert.deepEqual(rows(initial), ['First\t  NEEDLE', 'Undated', 'Second task']);
    assert.match(initial, /data-testid="directory-project-name"[^>]*>Owner needle/);
    assert.match(initial, /data-testid="directory-task-completion">Completed/);
    assert.match(initial, /data-testid="directory-task-priority">High/);
    assert.match(initial, /data-testid="directory-task-due-date">2024-02-29/);
    assert.match(initial, /data-testid="directory-task-notes"[^>]*>  &lt;b&gt;日本語&lt;\/b&gt;\n next  <\/span>/);
    const resultRows = initial.split('data-testid="directory-task-row"').slice(1).join('');
    assert.doesNotMatch(resultRows, /<(input|textarea|select)\b/);
    assert.doesNotMatch(resultRows, /method="post"/);
    assert.match(initial, /action="\/projects\/1"><button type="submit">Open project/);
    assert.deepEqual(rows(await get('/directory?search=first%20needle')), ['First\t  NEEDLE']);
    assert.deepEqual(rows(await get('/directory?search=needle')), ['First\t  NEEDLE']); // Neither owner nor notes match.
    assert.deepEqual(rows(await get('/directory?filter=Open&priorityFilter=High')), ['Second task']);
    assert.deepEqual(rows(await get('/directory?filter=Completed')), ['First\t  NEEDLE']);
    assert.deepEqual(rows(await get('/directory?filter=Deleted')), ['Deleted early', 'Deleted late']);
    assert.deepEqual(rows(await get('/directory?scope=Archived')), ['Archived task']);
    assert.deepEqual(rows(await get('/directory?scope=Archived&filter=Deleted')), ['Archived deleted']);
    const range = '/directory/due-range?filter=All&priorityFilter=High&search=task&dueFrom=2024-03-01&dueThrough=2024-03-01';
    assert.deepEqual(rows(await get(range)), ['Second task']);
    const invalid = await get('/directory/due-range?priorityFilter=High&dueFrom=2023-02-29&appliedFrom=2024-02-29&appliedThrough=2024-02-29');
    assert.match(invalid, /role="alert">Due range must use valid YYYY-MM-DD dates/);
    assert.deepEqual(rows(invalid), ['First\t  NEEDLE']);
    assert.match(invalid, /name="dueFrom" value="2024-02-29"/); // Other forms retain the applied range.
    const reversed = await get('/directory/due-range?dueFrom=2024-03-02&dueThrough=2024-03-01');
    assert.match(reversed, /Due from must not be after Due through/);
    assert.deepEqual(rows(await get('/directory?dueThrough=2024-02-29')), ['First\t  NEEDLE']);
    assert.deepEqual(snapshot(), before);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual(rows(await get('/directory')), ['Undated', 'Second task', 'First\t  NEEDLE']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/1/tasks/2/restore');
    assert.deepEqual(rows(await get('/directory')), ['First\t  NEEDLE', 'Deleted early', 'Undated', 'Second task']);
    await stop();
    await start();
    assert.deepEqual(rows(await get('/directory')), ['First\t  NEEDLE', 'Deleted early', 'Undated', 'Second task']);
    assert.deepEqual(rows(await get('/directory?filter=Deleted')), ['Deleted late']);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
