import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('read-only directory intersects filters, preserves state and follows owner/task order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-'));
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
  const task = (title, extra = {}) => ({ title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false, ...extra });
  async function imported(name, archived, tasks) {
    const json = JSON.stringify({ format: 'workboard-project', version: 1, project: { name, archived, defaultPriority: 'Low', tasks } });
    assert.equal((await post('/projects/import', { name, json })).status, 303);
  }
  const titles = html => [...html.matchAll(/data-testid="directory-task-title">([^<]*)<\/div>/g)].map(match => match[1]);
  const snapshot = () => {
    const db = new DatabaseSync(database);
    try { return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); }
    finally { db.close(); }
  };
  try {
    await start();
    await imported('Owner needle', false, [
      task('Alpha  \tONE', { completed: true, priority: 'High', dueDate: '2000-02-29', notes: '  <b>雪&</b>\nnext\n  ' }),
      task('Reserved', { deleted: true, priority: 'High', dueDate: '2000-02-29' }),
      task('Undated', { notes: 'needle' }),
    ]);
    await imported('Second', false, [task('Later', { priority: 'Low', dueDate: '2001-01-01' })]);
    await imported('Archive', true, [task('Archived live'), task('Archived deleted', { deleted: true })]);
    const before = snapshot();
    assert.match(await get('/'), /action="\/directory"><button type="submit">Task directory/);
    const initial = await get('/directory');
    assert.deepEqual(titles(initial), ['Alpha  \tONE', 'Undated', 'Later']);
    assert.match(initial, /data-testid="directory-project-name">Owner needle/);
    assert.match(initial, /data-testid="directory-task-completion">Completed/);
    assert.match(initial, /data-testid="directory-task-priority">High/);
    assert.match(initial, /data-testid="directory-task-due-date">2000-02-29/);
    assert.match(initial, /white-space: pre-wrap">  &lt;b&gt;雪&amp;&lt;\/b&gt;\nnext\n  <\/div>/);
    const rows = initial.split('data-testid="directory-task-row"').slice(1).join('');
    assert.doesNotMatch(rows, /<input|<textarea|<select|Delete task|Move task|Save notes/);
    assert.match(rows, /action="\/projects\/1"><button type="submit">Open project/);
    assert.deepEqual(titles(await get('/directory?scope=Archived')), ['Archived live']);
    assert.deepEqual(titles(await get('/directory?scope=Archived&filter=Deleted')), ['Archived deleted']);
    assert.deepEqual(titles(await get('/directory?filter=Deleted')), ['Reserved']);
    assert.deepEqual(titles(await get('/directory?filter=Open')), ['Undated', 'Later']);
    assert.deepEqual(titles(await get('/directory?search=needle')), []); // Neither notes nor owner name match.
    const params = new URLSearchParams({ scope: 'Active', filter: 'Completed', priorityFilter: 'High', dueFrom: '2000-02-29', dueThrough: '2000-02-29', search: '  ALPHA\t one  ' });
    assert.deepEqual(titles(await get('/directory?' + params)), ['Alpha  \tONE']);
    assert.deepEqual(titles(await get('/directory?dueFrom=2000-02-29')), ['Alpha  \tONE', 'Later']);
    const values = Object.fromEntries(params);
    for (const [from, through, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2001-01-01', '2000-02-29', 'Due from must not be after Due through'],
    ]) {
      const result = await post('/directory/due-range', { ...values, from, through });
      assert.equal(result.status, 400);
      const html = await result.text();
      assert.ok(html.includes(`role="alert">${message}`));
      assert.deepEqual(titles(html), ['Alpha  \tONE']);
      assert.match(html, /name="dueFrom" value="2000-02-29"/);
      assert.match(html, /<option selected>Completed/);
      assert.match(html, /<option selected>High/);
    }
    const applied = await post('/directory/due-range', { ...values, from: ' 2000-02-29 ', through: '2000-02-29' });
    assert.equal(applied.status, 303);
    assert.deepEqual(titles(await get(applied.headers.get('location'))), ['Alpha  \tONE']);
    assert.deepEqual(snapshot(), before);
    // Moving and returning affects ownership but restores remembered order in the directory.
    assert.equal((await post('/projects/1/tasks/1/move', { destination: '2' })).status, 303);
    assert.deepEqual(titles(await get('/directory')), ['Undated', 'Later', 'Alpha  \tONE']);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 303);
    assert.equal((await post('/projects/1/tasks/2/restore', {})).status, 303);
    assert.deepEqual(titles(await get('/directory')), ['Alpha  \tONE', 'Reserved', 'Undated', 'Later']);
    await stop(); await start();
    assert.deepEqual(titles(await get('/directory')), ['Alpha  \tONE', 'Reserved', 'Undated', 'Later']);
    const reset = await get('/directory');
    assert.match(reset, /<option selected>Active/);
    assert.match(reset, /id="directory-search" name="search" type="text" value=""/);
    assert.match(reset, /id="due-from" name="from" type="text" value=""/);
  } finally { if (child) await stop(); await rm(directory, { recursive: true, force: true }); }
});
