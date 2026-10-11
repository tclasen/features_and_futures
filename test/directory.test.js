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
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    child.stdout.on('data', data => {
      const match = /listening on port (\d+)/.exec(data.toString());
      if (match) resolve(match[1]);
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exit = once(child, 'exit'); child.kill(); await exit; },
  };
}

const titles = html => [...html.matchAll(/data-testid="directory-task-title">([^<]*)<\/span>/g)].map(match => match[1]);

test('directory is read-only, intersects all filters, preserves range on errors, and opens default project pages', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-directory-'));
  const dbPath = join(dir, 'db.sqlite');
  let server;
  let db;
  try {
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, data = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const task = (title, fields = {}) => ({ title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false, ...fields });
    const imported = async (name, archived, tasks) => {
      const response = await post('/projects/import', { importedName: name, json: JSON.stringify({
        format: 'workboard-project', version: 1,
        project: { name, archived, defaultPriority: 'High', tasks },
      }) });
      assert.equal(response.status, 303);
    };
    await imported('Owner needle', false, [
      task('  MiXeD  \t Title 雪  ', { completed: true, priority: 'High', dueDate: '2024-02-29', notes: '  <b>literal</b>\n雪\n  ' }),
      task('Deleted first', { deleted: true, completed: true, priority: 'High', dueDate: '2024-02-29' }),
      task('Undated', { notes: 'needle' }),
      task('Mixed title later', { priority: 'High', dueDate: '2024-03-01' }),
      task('Deleted last', { deleted: true }),
    ]);
    await imported('Second owner', false, [task('Second task')]);
    await imported('Archived owner', true, [task('Archived task'), task('Archived deleted', { deleted: true })]);
    db = new DatabaseSync(dbPath);
    const snapshot = () => JSON.stringify({
      projects: db.prepare('SELECT * FROM projects ORDER BY id').all(),
      tasks: db.prepare('SELECT * FROM tasks ORDER BY id').all(),
      positions: db.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all(),
    });
    const before = snapshot();
    assert.match(await get('/'), /action="\/directory" method="get"><button type="submit">Task directory/);
    const initial = await get('/directory');
    assert.deepEqual(titles(initial), ['  MiXeD  \t Title 雪  ', 'Undated', 'Mixed title later', 'Second task']);
    assert.match(initial, /<option selected>Active/);
    assert.match(initial, /name="filter"[\s\S]*?<option selected>All/);
    assert.match(initial, /name="priorityFilter"[\s\S]*?<option selected>All/);
    assert.match(initial, /name="rangeFrom" value=""/);
    assert.match(initial, /name="rangeThrough" value=""/);
    assert.match(initial, /name="search" value=""/);
    assert.match(initial, /data-testid="directory-project-name">Owner needle/);
    assert.match(initial, /data-testid="directory-task-completion">Completed/);
    assert.match(initial, /data-testid="directory-task-priority">High/);
    assert.match(initial, /data-testid="directory-task-due-date">2024-02-29/);
    assert.match(initial, /data-testid="directory-task-due-date"><\/span>/);
    assert.match(initial, /data-testid="directory-task-notes" style="white-space: pre-wrap">  &lt;b&gt;literal&lt;\/b&gt;\n雪\n  <\/span>/);
    const rows = initial.slice(initial.indexOf('<section aria-label="Directory tasks">'));
    assert.doesNotMatch(rows, /<(input|textarea|select)\b|method="post"/);
    assert.match(rows, /action="\/projects\/1" method="get"><button type="submit">Open project/);
    assert.match(initial, /action="\/" method="get"><button type="submit">Projects/);
    assert.deepEqual(titles(await get('/directory?scope=Archived')), ['Archived task']);
    assert.deepEqual(titles(await get('/directory?scope=Archived&filter=Deleted')), ['Archived deleted']);
    assert.deepEqual(titles(await get('/directory?filter=Deleted')), ['Deleted first', 'Deleted last']);
    assert.deepEqual(titles(await get('/directory?filter=Open')), ['Undated', 'Mixed title later', 'Second task']);
    assert.deepEqual(titles(await get('/directory?search=needle')), []); // Neither notes nor owner names match.
    const selection = { scope: 'Active', filter: 'Completed', priorityFilter: 'High',
      dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: '  mixed\t  title  ' };
    const query = new URLSearchParams(selection);
    const filtered = await get(`/directory?${query}`);
    assert.deepEqual(titles(filtered), ['  MiXeD  \t Title 雪  ']);
    assert.match(filtered, /name="search" value="mixed\t  title"/);
    assert.match(filtered, /name="dueFrom" value="2024-02-29"/);
    assert.match(filtered, /<option selected>Completed/);
    assert.match(filtered, /<option selected>High/);
    assert.deepEqual(titles(await get('/directory?dueFrom=2024-02-29')), ['  MiXeD  \t Title 雪  ', 'Mixed title later']);
    assert.deepEqual(titles(await get('/directory?dueThrough=2024-02-29')), ['  MiXeD  \t Title 雪  ']);
    for (const [from, through, error] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-29', 'Due from must not be after Due through'],
    ]) {
      const response = await post('/directory/due-range', { ...selection, rangeFrom: from, rangeThrough: through });
      const html = await response.text();
      assert.match(html, new RegExp(`role="alert">${error}`));
      assert.deepEqual(titles(html), ['  MiXeD  \t Title 雪  ']);
      assert.match(html, /name="dueFrom" value="2024-02-29"/);
    }
    const applied = await post('/directory/due-range', { ...selection, rangeFrom: ' 2024-02-29 ', rangeThrough: '\t2024-02-29 ' });
    assert.equal(applied.status, 303);
    assert.deepEqual(titles(await get(applied.headers.get('location'))), ['  MiXeD  \t Title 雪  ']);
    const cleared = await post('/directory/due-range', { ...selection, rangeFrom: '', rangeThrough: '' });
    const clearedLocation = new URL(cleared.headers.get('location'), server.url);
    assert.equal(clearedLocation.searchParams.get('priorityFilter'), 'High');
    assert.deepEqual(titles(await get(cleared.headers.get('location'))), ['  MiXeD  \t Title 雪  ']);
    const detail = await get('/projects/1');
    assert.match(detail, /name="filter"[\s\S]*?<option selected>All/);
    assert.match(detail, /name="rangeFrom" value=""/);
    const archivedDetail = await get('/projects/3');
    assert.match(archivedDetail, /Archived project/);
    assert.match(archivedDetail, /Create task<\/button>/);
    assert.equal(snapshot(), before);
    // Current ownership and remembered positions are reflected without special directory storage.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual(titles(await get('/directory')), ['Undated', 'Mixed title later', 'Second task', '  MiXeD  \t Title 雪  ']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await get('/directory')), titles(initial));
    const afterMoves = snapshot();
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(titles(await get('/directory')), titles(initial));
    assert.deepEqual(titles(await get('/directory?filter=Deleted')), ['Deleted first', 'Deleted last']);
    assert.equal(snapshot(), afterMoves);
  } finally {
    db?.close();
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
