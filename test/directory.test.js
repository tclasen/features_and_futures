import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('directory is read-only, ordered, intersects filters and preserves portable task values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-directory-'));
  const dbPath = join(dir, 'db.sqlite');
  let child, base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit'] });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  };
  const stop = async () => { const exit = once(child, 'exit'); child.kill(); await exit; };
  const post = (path, data) => fetch(base + path, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual' });
  const html = async path => (await fetch(base + path)).text();
  const titles = text => [...text.matchAll(/data-testid="directory-task-title"[^>]*>(.*?)<\/div>/gs)].map(match => match[1]);
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    try { return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); }
    finally { db.close(); }
  };
  const task = (title, extra = {}) => ({ title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false, ...extra });
  const importProject = (name, archived, tasks) => post('/projects/import', { importName: name, json: JSON.stringify({ format: 'workboard-project', version: 1, project: { name, archived, defaultPriority: 'Low', tasks } }) });
  try {
    await start();
    assert.match(await html('/'), /action="\/directory"><button type="submit">Task directory/);
    await importProject('Owner needle', false, [
      task('First', { notes: 'needle only in notes' }),
      task('  MiXeD  \t Title 雪  ', { completed: true, priority: 'High', dueDate: '2024-02-29', notes: '  <b>&雪</div>\nnext\n ' }),
      task('Deleted one', { deleted: true, priority: 'High', dueDate: '2024-02-29' }),
      task('Deleted two', { deleted: true })
    ]);
    await importProject('Second owner', false, [task('Last', { priority: 'High', dueDate: '2024-03-01' })]);
    await importProject('Archived owner', true, [task('Archived live'), task('Archived deleted', { deleted: true })]);
    const before = snapshot();
    let result = await html('/directory');
    assert.deepEqual(titles(result), ['First', '  MiXeD  \t Title 雪  ', 'Last']);
    for (const id of ['directory-project-name', 'directory-task-completion', 'directory-task-priority', 'directory-task-due-date', 'directory-task-notes']) assert.ok(result.includes(`data-testid="${id}"`));
    assert.ok(result.includes('  &lt;b&gt;&amp;雪&lt;/div&gt;\nnext\n '));
    assert.match(result, /data-testid="directory-task-completion">Completed/);
    assert.match(result, /action="\/projects\/1"><button type="submit">Open project/);
    assert.doesNotMatch(result, /<textarea|type="checkbox"|Rename task|Save notes|Move task|Delete task|Restore task/);
    assert.match(result, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(result, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option><option>Deleted<\/option>/);
    assert.match(result, /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    assert.deepEqual(titles(await html('/directory?search=needle')), []);
    const params = new URLSearchParams({ filter: 'Completed', priorityFilter: 'High', search: '  mixed\t title  ', dueFrom: '2024-02-29', dueThrough: '2024-02-29' });
    result = await html('/directory?' + params);
    assert.deepEqual(titles(result), ['  MiXeD  \t Title 雪  ']);
    assert.match(result, /value="2024-02-29"/);
    assert.match(result, /<option selected>Completed/);
    assert.match(result, /<option selected>High/);
    assert.deepEqual(titles(await html('/directory?filter=Deleted')), ['Deleted one', 'Deleted two']);
    assert.deepEqual(titles(await html('/directory?filter=Deleted&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-02-29')), ['Deleted one']);
    assert.deepEqual(titles(await html('/directory?scope=Archived')), ['Archived live']);
    assert.deepEqual(titles(await html('/directory?scope=Archived&filter=Deleted')), ['Archived deleted']);
    assert.deepEqual(titles(await html('/directory?filter=Open&priorityFilter=High&dueThrough=2024-03-01')), ['Last']);
    for (const [from, through, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through']
    ]) {
      const invalid = new URLSearchParams(params);
      invalid.set('applyRange', '1'); invalid.set('rangeFrom', from); invalid.set('rangeThrough', through);
      result = await html('/directory?' + invalid);
      assert.ok(result.includes('role="alert">' + message));
      assert.deepEqual(titles(result), ['  MiXeD  \t Title 雪  ']);
    }
    const valid = new URLSearchParams(params);
    valid.set('applyRange', '1'); valid.set('rangeFrom', ' 2024-02-29 '); valid.set('rangeThrough', '');
    const response = await fetch(base + '/directory?' + valid, { redirect: 'manual' });
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    const applied = new URL(location, base).searchParams;
    assert.equal(applied.get('filter'), 'Completed'); assert.equal(applied.get('priorityFilter'), 'High');
    assert.equal(applied.get('dueFrom'), '2024-02-29'); assert.equal(applied.get('dueThrough'), '');
    assert.equal(applied.get('search'), 'mixed\t title');
    assert.deepEqual(titles(await html(location)), ['  MiXeD  \t Title 雪  ']);
    assert.deepEqual(snapshot(), before);
    await stop(); await start();
    assert.deepEqual(titles(await html('/directory')), ['First', '  MiXeD  \t Title 雪  ', 'Last']);
    assert.deepEqual(snapshot(), before);
  } finally { if (child && child.exitCode === null) await stop(); await rm(dir, { recursive: true, force: true }); }
});
