import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('directory orders are stable, view-only, and retained through filters and bulk actions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-order-'));
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
  const post = (path, body) => fetch(base + path, { method: 'POST', body: new URLSearchParams(body), redirect: 'manual' });
  const get = async path => (await fetch(base + path)).text();
  const titles = html => [...html.matchAll(/data-testid="directory-task-title"[^>]*>(.*?)<\/span>/gs)].map(match => match[1]);
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    try { return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }))); }
    finally { db.close(); }
  };
  const task = (title, priority, dueDate, deleted = false) => ({ title, priority, dueDate, completed: false, notes: '  literal\nnotes  ', deleted });
  async function imported(name, archived, tasks) {
    await post('/projects/import', { name, json: JSON.stringify({ format: 'workboard-project', version: 1, project: { name, archived, defaultPriority: 'Normal', tasks } }) });
  }
  try {
    await start();
    await imported('First', false, [task('Zulu', 'Low', ''), task('alpha', 'High', '2024-03-01'), task('ALPHA', 'Normal', '2024-02-29'), task('a  b', 'Normal', ''), task('a b', 'High', '2024-02-29')]);
    await imported('Second', false, [task('Alpha', 'High', '2024-02-29'), task('\u{10000}', 'Low', ''), task('\uE000', 'Low', '')]);
    await imported('Archived', true, [task('z archived', 'Low', ''), task('a archived', 'High', '0001-01-01'), task('z deleted', 'Normal', '', true), task('a deleted', 'High', '9999-12-31', true)]);
    const before = snapshot();
    const original = ['Zulu', 'alpha', 'ALPHA', 'a  b', 'a b', 'Alpha', '\u{10000}', '\uE000'];
    const priority = ['alpha', 'a b', 'Alpha', 'ALPHA', 'a  b', 'Zulu', '\u{10000}', '\uE000'];
    const due = ['ALPHA', 'a b', 'Alpha', 'alpha', 'Zulu', 'a  b', '\u{10000}', '\uE000'];
    const title = ['a  b', 'a b', 'alpha', 'ALPHA', 'Alpha', 'Zulu', '\uE000', '\u{10000}'];
    for (const [order, expected] of [['Original', original], ['Priority', priority], ['Due date', due], ['Title', title]]) {
      const html = await get('/directory?' + new URLSearchParams({ order }));
      assert.deepEqual(titles(html), expected);
      assert.match(html, new RegExp(`<option selected>${order}</option>`));
      // Every GET/POST directory form carries the order through navigation.
      for (const form of html.matchAll(/<form[^>]*action="\/directory[^\"]*"[^>]*>(.*?)<\/form>/gs)) {
        assert.match(form[1], /name="order"/);
      }
    }
    assert.deepEqual(titles(await get('/directory?scope=Archived&order=Title')), ['a archived', 'z archived']);
    assert.deepEqual(titles(await get('/directory?scope=Archived&filter=Deleted&order=Priority')), ['a deleted', 'z deleted']);
    const fields = { scope: 'Active', filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01', search: 'alpha', order: 'Due date' };
    assert.deepEqual(titles(await get('/directory?' + new URLSearchParams(fields))), ['Alpha', 'alpha']);
    const invalid = await get('/directory/due-range?' + new URLSearchParams({ ...fields, dueFrom: '2024-02-30', appliedFrom: fields.dueFrom, appliedThrough: fields.dueThrough }));
    assert.match(invalid, /Due range must use valid/);
    assert.match(invalid, /<option selected>Due date<\/option>/);
    assert.deepEqual(titles(invalid), ['Alpha', 'alpha']);
    assert.deepEqual(snapshot(), before);
    // Export remains in original stored order regardless of directory ordering.
    const exported = await (await fetch(base + '/projects/1/download')).json();
    assert.deepEqual(exported.project.tasks.map(task => task.title), original.slice(0, 5));
    const response = await post('/directory/complete', fields);
    const location = response.headers.get('location');
    const params = new URL(location, base).searchParams;
    for (const [key, value] of Object.entries(fields)) assert.equal(params.get(key), value);
    const empty = await get(location);
    assert.match(empty, /No matching tasks/);
    assert.match(empty, /<option selected>Due date<\/option>/);
    assert.deepEqual(titles(await get('/directory?' + new URLSearchParams({ ...fields, filter: 'Completed' }))), ['Alpha', 'alpha']);
    const after = snapshot();
    const expected = structuredClone(before);
    expected[1][1].completed = 1;
    expected[1][5].completed = 1;
    assert.deepEqual(after, expected);
    await stop();
    await start();
    assert.deepEqual(snapshot(), after);
    assert.deepEqual(titles(await get('/directory')), original);
    assert.match(await get('/directory'), /<option selected>Original<\/option>/);
    assert.deepEqual(titles(await get('/directory?order=Title')), title);
    // Moves and returns still use remembered original positions.
    await post('/projects/1/tasks/2/move', { destination: '2' });
    await post('/projects/2/tasks/2/move', { destination: '1' });
    assert.deepEqual(snapshot()[1], after[1]);
    assert.deepEqual(titles(await get('/directory')), original);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
