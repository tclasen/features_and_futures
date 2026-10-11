import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const titles = html => [...html.matchAll(/data-testid="directory-task-title">([^<]*)<\/span>/g)].map(match => match[1]);

test('directory ordering is stable, code-point based, retained by actions, and never stored', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-order-'));
  const dbPath = join(dir, 'db.sqlite');
  let child;
  let db;
  try {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit'],
    });
    const port = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.stdout.on('data', data => {
        const match = /listening on port (\d+)/.exec(data.toString());
        if (match) resolve(match[1]);
      });
    });
    const url = `http://127.0.0.1:${port}`;
    const get = async path => (await fetch(url + path)).text();
    const post = (path, data) => fetch(url + path, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual' });
    const task = (title, priority, dueDate = '', deleted = false) => ({ title, priority, dueDate, deleted, completed: false, notes: 'literal notes' });
    const importProject = async (name, archived, tasks) => {
      assert.equal((await post('/projects/import', { importedName: name, json: JSON.stringify({
        format: 'workboard-project', version: 1, project: { name, archived, defaultPriority: 'Normal', tasks },
      }) })).status, 303);
    };
    await importProject('First', false, [task('zulu', 'Low'), task('Beta', 'High', '2025-03-01'), task('alpha  z', 'Normal', '2025-01-01'), task('Deleted z', 'Low', '', true)]);
    await importProject('Second', false, [task('bETA', 'High', '2025-03-01'), task('alpha z', 'Normal'), task('\u{10000}', 'Low'), task('\uE000', 'Low'), task('Deleted a', 'High', '', true)]);
    await importProject('Archived', true, [task('z', 'Low'), task('a', 'High'), task('deleted z', 'Low', '', true), task('deleted a', 'High', '', true)]);
    db = new DatabaseSync(dbPath);
    const snapshot = () => JSON.stringify({
      projects: db.prepare('SELECT * FROM projects ORDER BY id').all(),
      tasks: db.prepare('SELECT * FROM tasks ORDER BY id').all(),
      positions: db.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all(),
    });
    const before = snapshot();
    const original = ['zulu', 'Beta', 'alpha  z', 'bETA', 'alpha z', '\u{10000}', '\uE000'];
    const initial = await get('/directory');
    assert.match(initial, /<label for="directory-order">Directory order<\/label>/);
    assert.match(initial, /name="order"[^>]*>\s*<option selected>Original<\/option><option>Priority<\/option><option>Due date<\/option><option>Title<\/option>/);
    assert.deepEqual(titles(initial), original);
    assert.deepEqual(titles(await get('/directory?order=Priority')), ['Beta', 'bETA', 'alpha  z', 'alpha z', 'zulu', '\u{10000}', '\uE000']);
    assert.deepEqual(titles(await get('/directory?order=Due+date')), ['alpha  z', 'Beta', 'bETA', 'zulu', 'alpha z', '\u{10000}', '\uE000']);
    assert.deepEqual(titles(await get('/directory?order=Title')), ['alpha  z', 'alpha z', 'Beta', 'bETA', 'zulu', '\uE000', '\u{10000}']);
    assert.deepEqual(titles(await get('/directory?scope=Archived&order=Priority')), ['a', 'z']);
    assert.deepEqual(titles(await get('/directory?scope=Archived&filter=Deleted&order=Title')), ['deleted a', 'deleted z']);
    assert.deepEqual(titles(await get('/directory?filter=Deleted&order=Priority')), ['Deleted a', 'Deleted z']);
    const selection = { scope: 'Active', filter: 'Open', priorityFilter: 'High', search: 'beta', dueFrom: '', dueThrough: '', order: 'Title' };
    const filtered = await get(`/directory?${new URLSearchParams(selection)}`);
    assert.deepEqual(titles(filtered), ['Beta', 'bETA']);
    assert.match(filtered, /<option selected>Title/);
    // Search, range and both bulk forms carry order; scope/filter/order share one form.
    assert.equal((filtered.match(/name="order" value="Title"/g) || []).length, 4);
    const invalid = await post('/directory/due-range', { ...selection, rangeFrom: '2025-02-29', rangeThrough: '' });
    const invalidHtml = await invalid.text();
    assert.match(invalidHtml, /Due range must use valid/);
    assert.match(invalidHtml, /<option selected>Title/);
    assert.deepEqual(titles(invalidHtml), ['Beta', 'bETA']);
    const applied = await post('/directory/due-range', { ...selection, rangeFrom: '2025-03-01', rangeThrough: '2025-03-01' });
    assert.equal(new URL(applied.headers.get('location'), url).searchParams.get('order'), 'Title');
    assert.deepEqual(titles(await get(applied.headers.get('location'))), ['Beta', 'bETA']);
    assert.equal(snapshot(), before);
    const completed = await post('/directory/completion', { ...selection, completed: '1' });
    assert.equal(new URL(completed.headers.get('location'), url).searchParams.get('order'), 'Title');
    const empty = await get(completed.headers.get('location'));
    assert.match(empty, /No matching tasks/);
    assert.match(empty, /<option selected>Title/);
    assert.deepEqual(titles(await get('/directory?filter=Completed&order=Due+date')), ['Beta', 'bETA']);
    const positions = db.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all();
    const originalSnapshot = JSON.parse(before);
    assert.deepEqual(positions, originalSnapshot.positions.map(row => Object.assign(Object.create(null), row)));
    const exported = await (await fetch(url + '/projects/1/export')).json();
    assert.deepEqual(exported.project.tasks.map(task => task.title), ['zulu', 'Beta', 'alpha  z', 'Deleted z']);
    assert.deepEqual(titles(await get('/directory')), original); // Every opening defaults again.
    const projectPage = await get('/projects/1');
    assert.ok(projectPage.indexOf('<span>zulu</span>') < projectPage.indexOf('<span>Beta</span>'));
    assert.match(await get('/health'), /"status":"ok"/);
  } finally {
    db?.close();
    if (child) { const exit = once(child, 'exit'); child.kill(); await exit; }
    await rm(dir, { recursive: true, force: true });
  }
});
