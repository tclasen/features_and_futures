import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('directory ordering is stable, code-point based, retained by actions and view-only', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-order-'));
  const database = join(directory, 'db.sqlite');
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
  const task = (title, priority, dueDate, deleted = false) => ({ title, priority, dueDate, completed: false, notes: 'literal notes', deleted });
  const titles = html => [...html.matchAll(/data-testid="directory-task-title">([^<]*)</g)].map(match => match[1]);
  const snapshot = () => {
    const db = new DatabaseSync(database);
    try { return Object.fromEntries(['projects', 'tasks', 'task_positions'].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }))])); }
    finally { db.close(); }
  };
  async function imported(name, archived, tasks) {
    const json = JSON.stringify({ format: 'workboard-project', version: 1, project: { name, archived, defaultPriority: 'Normal', tasks } });
    assert.equal((await post('/projects/import', { name, json })).status, 303);
  }
  try {
    await start();
    await imported('First', false, [task('Zulu', 'Low', ''), task('ALPHA', 'High', '2025-01-02'), task('alpha', 'Normal', '2024-01-01'), task('Deleted Z', 'Low', '', true)]);
    await imported('Second', false, [task('Beta', 'High', '2025-01-02'), task('\u{10000}', 'Normal', ''), task('\uE000', 'Normal', ''), task('a  b', 'Low', ''), task('a b', 'Low', ''), task('Deleted A', 'High', '', true)]);
    await imported('Archived', true, [task('Archive Z', 'Low', ''), task('Archive A', 'High', ''), task('Gone Z', 'Low', '', true), task('Gone A', 'High', '', true)]);
    const before = snapshot();
    const original = ['Zulu', 'ALPHA', 'alpha', 'Beta', '\u{10000}', '\uE000', 'a  b', 'a b'];
    let html = await get('/directory');
    assert.deepEqual(titles(html), original);
    assert.match(html, /<label for="directory-order">Directory order<\/label>/);
    assert.match(html, /<option selected>Original<\/option><option>Priority<\/option><option>Due date<\/option><option>Title<\/option>/);
    assert.deepEqual(titles(await get('/directory?order=Priority')), ['ALPHA', 'Beta', 'alpha', '\u{10000}', '\uE000', 'Zulu', 'a  b', 'a b']);
    assert.deepEqual(titles(await get('/directory?order=Due+date')), ['alpha', 'ALPHA', 'Beta', 'Zulu', '\u{10000}', '\uE000', 'a  b', 'a b']);
    assert.deepEqual(titles(await get('/directory?order=Title')), ['a  b', 'a b', 'ALPHA', 'alpha', 'Beta', 'Zulu', '\uE000', '\u{10000}']);
    assert.deepEqual(titles(await get('/directory?filter=Deleted&order=Title')), ['Deleted A', 'Deleted Z']);
    assert.deepEqual(titles(await get('/directory?scope=Archived&order=Priority')), ['Archive A', 'Archive Z']);
    assert.deepEqual(titles(await get('/directory?scope=Archived&filter=Deleted&order=Due+date')), ['Gone Z', 'Gone A']);
    assert.deepEqual(snapshot(), before);
    const values = { scope: 'Active', filter: 'Open', priorityFilter: 'High', dueFrom: '', dueThrough: '', search: '', order: 'Title' };
    html = await get('/directory?' + new URLSearchParams(values));
    // Every non-order form carries the selected ordering through submissions.
    assert.equal((html.match(/name="order" value="Title"/g) || []).length, 3);
    let response = await post('/directory/due-range', { ...values, from: '2025-01-01', through: '2025-12-31' });
    let location = response.headers.get('location');
    assert.equal(new URL(location, base).searchParams.get('order'), 'Title');
    assert.deepEqual(titles(await get(location)), ['ALPHA', 'Beta']);
    response = await post('/directory/due-range', { ...values, from: '2025-02-29', through: '' });
    html = await response.text();
    assert.match(html, /Due range must use valid/);
    assert.match(html, /<option selected>Title<\/option>/);
    assert.deepEqual(titles(html), ['ALPHA', 'Beta']);
    response = await post('/directory/completion', { ...values, completed: 'true' });
    location = response.headers.get('location');
    assert.equal(new URL(location, base).searchParams.get('order'), 'Title');
    assert.match(await get(location), /No matching tasks/);
    const after = snapshot();
    assert.deepEqual(after.projects, before.projects);
    assert.deepEqual(after.task_positions, before.task_positions);
    assert.deepEqual(after.tasks, before.tasks.map(task => [2, 5].includes(task.id) ? { ...task, completed: 1 } : task));
    const exported = await (await fetch(base + '/projects/1/export')).json();
    assert.deepEqual(exported.project.tasks.map(task => task.title), ['Zulu', 'ALPHA', 'alpha', 'Deleted Z']);
    await stop(); await start();
    assert.deepEqual(snapshot(), after);
    assert.deepEqual(titles(await get('/directory')), original);
    assert.match(await get('/projects/1'), /<option selected>All<\/option>/);
    assert.deepEqual(titles(await get('/directory?order=invalid')), original);
  } finally { if (child) await stop(); await rm(directory, { recursive: true, force: true }); }
});
