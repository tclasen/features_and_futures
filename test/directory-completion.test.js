import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('directory bulk completion intersects all filters and persists without altering other fields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-bulk-'));
  const database = join(directory, 'data.sqlite');
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: database }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill(); await exited; child = null; }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values) => fetch(base + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const task = (title, extra = {}) => ({ title, completed: false, priority: 'High', dueDate: '2024-02-29', notes: '  notes\n雪<> ', deleted: false, ...extra });
  async function imported(name, archived, tasks) {
    const json = JSON.stringify({ format: 'workboard-project', version: 1, project: { name, archived, defaultPriority: 'Low', tasks } });
    assert.equal((await post('/projects/import', { name, json })).status, 303);
  }
  const snapshot = () => {
    const db = new DatabaseSync(database);
    try { return Object.fromEntries(['projects', 'tasks', 'task_positions'].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }))])); }
    finally { db.close(); }
  };
  const disabled = (html, label) => assert.ok(html.includes(` disabled>${label}</button>`));
  const enabled = (html, label) => assert.ok(html.includes(`">${label}</button>`));
  const values = { scope: 'Active', filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: ' TARGET\t task ' };
  try {
    await start();
    await imported('First', false, [task('Target  task'), task('Target task done', { completed: true }), task('Target task deleted', { deleted: true }), task('Target task low', { priority: 'Low' }), task('Target task undated', { dueDate: '' }), task('Other'), task('Target task later', { dueDate: '2024-03-01' })]);
    await imported('Second', false, [task('TARGET\ttask second')]);
    await imported('Archived', true, [task('Target task archive')]);
    const before = snapshot();
    let html = await get('/directory?' + new URLSearchParams(values));
    enabled(html, 'Complete visible tasks');
    disabled(html, 'Reopen visible tasks');
    let result = await post('/directory/completion', { ...values, completed: 'true' });
    assert.equal(result.status, 303);
    const location = result.headers.get('location');
    const params = new URL(location, base).searchParams;
    for (const [key, value] of Object.entries(values)) assert.equal(params.get(key), key === 'search' ? value.trim() : value);
    html = await get(location);
    assert.match(html, /No matching tasks/);
    assert.doesNotMatch(html, /data-testid="directory-task-row"/);
    disabled(html, 'Complete visible tasks'); disabled(html, 'Reopen visible tasks');
    const after = snapshot();
    assert.deepEqual(after.projects, before.projects);
    assert.deepEqual(after.task_positions, before.task_positions);
    assert.deepEqual(after.tasks, before.tasks.map(task => [1, 8].includes(task.id) ? { ...task, completed: 1 } : task));
    assert.match(await get('/'), /2\/6 completed/);
    assert.match(await get('/'), /1\/1 completed/);
    // Idempotent submission; restricted scopes must also be protected server-side.
    await post('/directory/completion', { ...values, completed: 'true' });
    for (const state of [{ scope: 'Archived', filter: 'All' }, { scope: 'Active', filter: 'Deleted' }]) {
      html = await get('/directory?' + new URLSearchParams(state));
      disabled(html, 'Complete visible tasks'); disabled(html, 'Reopen visible tasks');
      await post('/directory/completion', { ...state, completed: 'true' });
      await post('/directory/completion', { ...state, completed: 'false' });
    }
    assert.deepEqual(snapshot(), after);
    await stop(); await start();
    assert.deepEqual(snapshot(), after);
    const completedValues = { ...values, filter: 'Completed' };
    html = await get('/directory?' + new URLSearchParams(completedValues));
    disabled(html, 'Complete visible tasks'); enabled(html, 'Reopen visible tasks');
    result = await post('/directory/completion', { ...completedValues, completed: 'false' });
    html = await get(result.headers.get('location'));
    assert.match(html, /No matching tasks/);
    disabled(html, 'Complete visible tasks'); disabled(html, 'Reopen visible tasks');
    // Reopening matches the initially completed title too, without touching other fields.
    const reopened = snapshot();
    assert.deepEqual(reopened.tasks, before.tasks.map(task => task.id === 2 ? { ...task, completed: 0 } : task));
    await stop(); await start();
    assert.deepEqual(snapshot(), reopened);
    await post('/directory/completion', { ...values, completed: 'true' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    const moved = snapshot();
    assert.equal(moved.tasks[0].completed, 1);
    assert.equal(moved.tasks[0].notes, before.tasks[0].notes);
    assert.equal(moved.tasks[0].project_id, 2);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.equal(snapshot().tasks[0].sort_order, before.tasks[0].sort_order);
    html = await get('/directory?search=not-present');
    assert.match(html, /No matching tasks/);
    disabled(html, 'Complete visible tasks'); disabled(html, 'Reopen visible tasks');
  } finally { if (child) await stop(); await rm(directory, { recursive: true, force: true }); }
});
