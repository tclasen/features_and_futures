import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe']
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill(); await exited; }
  };
}

const titles = html => [...html.matchAll(/data-testid="directory-task-title"[^>]*>([^<]*)/g)].map(match => match[1]);
const rows = html => [...html.matchAll(/<div class="task" data-testid="directory-task-row">[\s\S]*?<\/form>\s*<\/div>/g)].map(match => match[0]);
const task = (title, fields = {}) => ({ title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false, ...fields });
const portable = (name, tasks, archived = false) => JSON.stringify({ format: 'workboard-project', version: 1,
  project: { name, archived, defaultPriority: 'Low', tasks } });

test('directory intersects read-only filters, preserves state, and follows current ownership and reserved order', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = async (path, values = {}) => (await fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    })).text();
    const importCopy = (name, tasks, archived = false) => post('/projects/import', {
      importedName: name, projectJson: portable('Original', tasks, archived)
    });
    const notes = '  literal <b>雪 & 😀</b>\n\nlast line\t  ';
    await importCopy('Owner only', [
      task('First'),
      task('Read\t  BOOK', { completed: true, priority: 'High', dueDate: '2024-02-29', notes }),
      task('Deleted read book', { deleted: true, priority: 'High', dueDate: '2024-02-29', notes }),
      task('Undated read book', { priority: 'High' }),
      task('Outside read book', { priority: 'High', dueDate: '2024-03-01' }),
      task('Notes only', { notes: 'needle read book' }),
      task('ÄBC')
    ]);
    await importCopy('Second owner', [task('Read Book', { priority: 'Low', dueDate: '0001-01-01' })]);
    await importCopy('Archived owner', [task('Archived live'), task('Archived deleted', { deleted: true, completed: true })], true);
    await post('/projects', { name: 'Empty' });
    assert.match(await get('/'), /action="\/directory"><button type="submit">Task directory/);
    let html = await get('/directory');
    assert.deepEqual(titles(html), ['First', 'Read\t  BOOK', 'Undated read book', 'Outside read book', 'Notes only', 'ÄBC', 'Read Book']);
    assert.match(html, /<h1>Task directory<\/h1>/);
    assert.match(html, /action="\/"><button type="submit">Projects/);
    assert.match(html, /id="project-scope"[\s\S]*?<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(html, /id="task-filter"[\s\S]*?<option selected>All<\/option><option>Open<\/option><option>Completed<\/option><option>Deleted<\/option>/);
    assert.match(html, /id="priority-filter"[\s\S]*?<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    const readRow = rows(html)[1];
    assert.match(readRow, /data-testid="directory-project-name"[^>]*>Owner only<\/div>/);
    assert.match(readRow, /data-testid="directory-task-completion">Completed<\/div>/);
    assert.match(readRow, /data-testid="directory-task-priority">High<\/div>/);
    assert.match(readRow, /data-testid="directory-task-due-date">2024-02-29<\/div>/);
    assert.match(readRow, /data-testid="directory-task-notes" style="white-space: pre-wrap; overflow-wrap: anywhere">  literal &lt;b&gt;雪 &amp; 😀&lt;\/b&gt;&#10;&#10;last line\t  <\/div>/);
    assert.match(readRow, /action="\/projects\/1"><button type="submit">Open project/);
    for (const row of rows(html)) {
      assert.doesNotMatch(row, /<(?:input|textarea|select)\b/);
      assert.deepEqual([...row.matchAll(/<button[^>]*>([^<]*)/g)].map(match => match[1]), ['Open project']);
    }
    const query = state => '/directory?' + new URLSearchParams(state);
    assert.deepEqual(titles(await get(query({ search: '  READ\t \tbook  ' }))), ['Read\t  BOOK', 'Undated read book', 'Outside read book', 'Read Book']);
    for (const search of ['Owner only', 'needle', 'äbc']) assert.deepEqual(titles(await get(query({ search }))), []);
    assert.deepEqual(titles(await get(query({ filter: 'Completed' }))), ['Read\t  BOOK']);
    assert.deepEqual(titles(await get(query({ filter: 'Deleted' }))), ['Deleted read book']);
    assert.deepEqual(titles(await get(query({ priorityFilter: 'Low' }))), ['Read Book']);
    assert.deepEqual(titles(await get(query({ scope: 'Archived' }))), ['Archived live']);
    assert.deepEqual(titles(await get(query({ scope: 'Archived', filter: 'Deleted' }))), ['Archived deleted']);
    assert.deepEqual(titles(await get(query({ dueThrough: '0001-01-01' }))), ['Read Book']);
    const state = { scope: 'Active', filter: 'Completed', priorityFilter: 'High', search: 'read book', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    html = await get(query(state));
    assert.deepEqual(titles(html), ['Read\t  BOOK']);
    // Each form carries all other applied values through changes.
    for (const form of html.matchAll(/<form[^>]*action="\/directory[^\"]*"[\s\S]*?<\/form>/g)) {
      for (const [name, value] of Object.entries(state)) {
        if (['scope', 'filter', 'priorityFilter'].includes(name) && form[0].includes(`name="${name}" onchange`)) {
          assert.match(form[0], new RegExp(`<option selected>${value}</option>`));
        } else assert.ok(form[0].includes(`name="${name}"`) && form[0].includes(`value="${value}"`), `${name} preserved`);
      }
    }
    const snapshots = await Promise.all([1, 2, 3, 4].map(id => get(`/projects/${id}/export`)));
    for (const [from, through, message] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through']
    ]) {
      html = await post('/directory/due-range', { ...state, from, through });
      assert.match(html, new RegExp(`role="alert">${message}`));
      assert.deepEqual(titles(html), ['Read\t  BOOK']);
      assert.match(html, /id="due-from"[^>]*value="2024-02-29"/);
    }
    html = await post('/directory/due-range', { ...state, from: ' 2024-02-29 ', through: '\t2024-02-29 ' });
    assert.deepEqual(titles(html), ['Read\t  BOOK']);
    html = await post('/directory/due-range', { ...state, filter: 'All', from: ' ', through: '' });
    assert.deepEqual(titles(html), ['Read\t  BOOK', 'Undated read book', 'Outside read book']);
    assert.deepEqual(await Promise.all([1, 2, 3, 4].map(id => get(`/projects/${id}/export`))), snapshots);
    // Moving out and back uses remembered order, not global task IDs or arrival order.
    await post('/projects/1/tasks/2/move', { destination: '2' });
    assert.deepEqual(titles(await get('/directory')), ['First', 'Undated read book', 'Outside read book', 'Notes only', 'ÄBC', 'Read Book', 'Read\t  BOOK']);
    assert.match(rows(await get('/directory')).at(-1), /directory-project-name"[^>]*>Second owner/);
    await post('/projects/2/tasks/2/move', { destination: '1' });
    await post('/projects/1/tasks/3/restore');
    assert.deepEqual(titles(await get('/directory')).slice(0, 4), ['First', 'Read\t  BOOK', 'Deleted read book', 'Undated read book']);
    await post('/projects/1/tasks/3/delete');
    await post('/projects/1/rename', { name: 'Renamed owner' });
    await post('/projects/1/archive');
    assert.deepEqual(titles(await get('/directory')), ['Read Book']);
    html = await get('/directory?scope=Archived&filter=Deleted');
    assert.deepEqual(titles(html), ['Deleted read book', 'Archived deleted']);
    assert.match(html, /directory-project-name"[^>]*>Renamed owner/);
    const projectHtml = await get('/projects/1');
    assert.match(projectHtml, /Archived project/);
    assert.match(projectHtml, /<option selected>All<\/option>/);
    assert.match(projectHtml, /id="due-from"[^>]*value=""/);
    assert.match(projectHtml, /id="task-search"[^>]*value=""/);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(titles(await get('/directory?scope=Archived&filter=Deleted')), ['Deleted read book', 'Archived deleted']);
    await post('/projects/1/restore');
    html = await get('/directory');
    assert.deepEqual(titles(html), ['First', 'Read\t  BOOK', 'Undated read book', 'Outside read book', 'Notes only', 'ÄBC', 'Read Book']);
    assert.match(html, /id="directory-search"[^>]*value=""/);
    assert.match(html, /id="due-through"[^>]*value=""/);
    assert.match(rows(html)[1], /last line\t  <\/div>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory displays upgraded records with public defaults and no editable rows', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-legacy-'));
  let server;
  try {
    const dbPath = join(directory, 'db.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Legacy');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Older first', 1), (1, 'Older second', 0);`);
    db.close();
    server = await start(dbPath);
    const html = await (await fetch(server.url + '/directory')).text();
    assert.deepEqual(titles(html), ['Older first', 'Older second']);
    assert.match(rows(html)[0], /directory-task-completion">Completed/);
    assert.match(rows(html)[1], /directory-task-completion">Open/);
    for (const row of rows(html)) {
      assert.match(row, /directory-task-priority">Normal/);
      assert.match(row, /directory-task-due-date"><\/div>/);
      assert.match(row, /directory-task-notes"[^>]*><\/div>/);
    }
    assert.deepEqual(titles(await (await fetch(server.url + '/directory?filter=Deleted')).text()), []);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
