import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('directory bulk actions update only eligible matching tasks, retain filters and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-bulk-'));
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
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    try { return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }))); }
    finally { db.close(); }
  };
  const task = (title, overrides = {}) => ({ title, completed: false, priority: 'High', dueDate: '2024-02-29', notes: '  <b>日本語</b>\n next  ', deleted: false, ...overrides });
  async function imported(name, archived, tasks) {
    await post('/projects/import', { name, json: JSON.stringify({ format: 'workboard-project', version: 1, project: { name, archived, defaultPriority: 'Low', tasks } }) });
  }
  const enabled = (html, label, expected) => {
    const match = html.match(new RegExp(`<button type="submit"([^>]*)>${label}</button>`));
    assert.ok(match, label);
    assert.equal(!match[1].includes('disabled'), expected, label);
  };
  try {
    await start();
    await imported('First', false, [
      task('Match\t  ONE'), task('Match done', { completed: true }),
      task('Match deleted', { deleted: true }), task('Other title'),
      task('Match low', { priority: 'Low' }), task('Match undated', { dueDate: '' }),
      task('Match later', { dueDate: '2024-03-01' })
    ]);
    await imported('Second', false, [task('Match two')]);
    await imported('Archived', true, [task('Match archived')]);
    const before = snapshot();
    const fields = { scope: 'Active', filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: '  MATCH  ' };
    const url = '/directory?' + new URLSearchParams(fields);
    const initial = await get(url);
    enabled(initial, 'Complete visible tasks', true);
    enabled(initial, 'Reopen visible tasks', false);
    const response = await post('/directory/complete', fields);
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    const params = new URL(location, base).searchParams;
    for (const [key, value] of Object.entries(fields)) assert.equal(params.get(key), value.trim());
    const empty = await get(location);
    assert.doesNotMatch(empty, /data-testid="directory-task-row"/);
    assert.match(empty, /role="status">No matching tasks</);
    enabled(empty, 'Complete visible tasks', false);
    enabled(empty, 'Reopen visible tasks', false);
    const after = snapshot();
    const expected = structuredClone(before);
    expected[1][0].completed = 1;
    expected[1][7].completed = 1;
    assert.deepEqual(after, expected); // Every field, position, and excluded task is unchanged.
    const home = await get('/');
    assert.match(home, /2\/6 completed/);
    assert.match(home, /1\/1 completed/);
    const completed = { ...fields, filter: 'Completed' };
    const completedHtml = await get('/directory?' + new URLSearchParams(completed));
    enabled(completedHtml, 'Complete visible tasks', false);
    enabled(completedHtml, 'Reopen visible tasks', true);
    for (const scope of ['Active', 'Archived']) {
      const deletedHtml = await get(`/directory?scope=${scope}&filter=Deleted`);
      enabled(deletedHtml, 'Complete visible tasks', false);
      enabled(deletedHtml, 'Reopen visible tasks', false);
      await post('/directory/reopen', { scope, filter: 'Deleted' });
    }
    const archivedHtml = await get('/directory?scope=Archived');
    enabled(archivedHtml, 'Complete visible tasks', false);
    enabled(archivedHtml, 'Reopen visible tasks', false);
    await post('/directory/complete', { scope: 'Archived', filter: 'All' });
    await post('/directory/reopen', { scope: 'Archived', filter: 'All' });
    await post('/directory/complete', fields); // Repeating an empty-result action is harmless.
    assert.deepEqual(snapshot(), after);
    await stop();
    await start();
    assert.deepEqual(snapshot(), after);
    // Movement retains bulk-updated completion, notes, dates, explicit priority and return order.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(snapshot()[1], after[1]);
    const reopened = await post('/directory/reopen', completed);
    const reopenedHtml = await get(reopened.headers.get('location'));
    assert.match(reopenedHtml, /No matching tasks/);
    assert.doesNotMatch(reopenedHtml, /data-testid="directory-task-row"/);
    const final = snapshot();
    const finalExpected = structuredClone(after);
    for (const index of [0, 1, 7]) finalExpected[1][index].completed = 0;
    assert.deepEqual(final[0], finalExpected[0]);
    assert.deepEqual(final[1], finalExpected[1]);
    await stop();
    await start();
    assert.deepEqual(snapshot(), final);
    const defaults = await get('/directory');
    assert.match(defaults, /<option selected>Active/);
    enabled(defaults, 'Complete visible tasks', true);
    enabled(defaults, 'Reopen visible tasks', false);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
