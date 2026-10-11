import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function assertOwners(html, expected) {
  const rows = [...html.matchAll(/data-testid="directory-owner-row">([\s\S]*?)<\/div>/g)];
  assert.deepEqual(rows.map(([, row]) => [
    Number(/action="\/projects\/(\d+)"/.exec(row)[1]),
    /data-testid="directory-owner-name">([^<]*)<\/span>/.exec(row)[1],
    /data-testid="directory-owner-summary">([^<]*)<\/span>/.exec(row)[1],
  ]), expected);
  let completed = 0;
  let total = 0;
  for (const [, , summary] of expected) {
    const [, k, n] = /^(\d+)\/(\d+) completed$/.exec(summary);
    completed += Number(k);
    total += Number(n);
  }
  assert.match(html, new RegExp(`data-testid="directory-summary">${completed}/${total} completed`));
  assert.equal((html.match(/data-testid="directory-task-row"/g) || []).length, total);
  assert.equal(html.includes('id="directory-empty" role="status">No matching tasks'), total === 0);
}

test('directory owners group by identity in creation order and track only current matches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-owners-'));
  const dbPath = join(dir, 'db.sqlite');
  let child;
  let db;
  let url;
  const start = async () => {
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
    url = `http://127.0.0.1:${port}`;
  };
  const stop = async () => { const exit = once(child, 'exit'); child.kill(); await exit; child = undefined; };
  const get = async path => (await fetch(url + path)).text();
  const post = (path, data) => fetch(url + path, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual' });
  const view = selections => get(`/directory?${new URLSearchParams(selections)}`);
  const task = (title, completed, priority = 'Normal', dueDate = '', deleted = false) =>
    ({ title, completed, priority, dueDate, deleted, notes: 'literal <notes>\n' });
  try {
    await start();
    assertOwners(await get('/directory'), []);
    const importProject = async (name, archived, tasks) => {
      const response = await post('/projects/import', { importedName: name, json: JSON.stringify({
        format: 'workboard-project', version: 1, project: { name, archived, defaultPriority: 'Normal', tasks },
      }) });
      assert.equal(response.status, 303);
    };
    await importProject('Same <name>', false, [
      task('Zeta match', false, 'Low', '2025-01-01'),
      task('Match  One', true, 'High', '2025-01-02'),
      task('Deleted match', true, 'High', '2025-01-02', true),
    ]);
    await importProject('Other', false, [
      task('Alpha match', false, 'High', '2025-01-02'), task('Unrelated', true),
      task('Deleted match two', false, 'High', '2025-01-02', true),
    ]);
    await post('/projects/2/rename', { name: '  Same <name>  ' });
    await importProject('Archived <owner>', true, [
      task('Match archived', true, 'High', '2025-01-02'), task('Other archived', false),
      task('Deleted archived', false, 'Low', '', true),
    ]);
    await importProject('Empty', false, []);
    const name = 'Same &lt;name&gt;';
    db = new DatabaseSync(dbPath);
    const snapshot = () => JSON.stringify({
      projects: db.prepare('SELECT * FROM projects ORDER BY id').all(),
      tasks: db.prepare('SELECT * FROM tasks ORDER BY id').all(),
      positions: db.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all(),
    });
    const before = snapshot();
    for (const order of ['Original', 'Priority', 'Due date', 'Title']) {
      assertOwners(await view({ order }), [[1, name, '1/2 completed'], [2, name, '1/2 completed']]);
      assertOwners(await view({ order, filter: 'Open' }), [[1, name, '0/1 completed'], [2, name, '0/1 completed']]);
      assertOwners(await view({ order, filter: 'Completed' }), [[1, name, '1/1 completed'], [2, name, '1/1 completed']]);
      assertOwners(await view({ order, filter: 'Deleted' }), [[1, name, '1/1 completed'], [2, name, '0/1 completed']]);
      assertOwners(await view({ order, scope: 'Archived' }), [[3, 'Archived &lt;owner&gt;', '1/2 completed']]);
      assertOwners(await view({ order, scope: 'Archived', filter: 'Deleted' }), [[3, 'Archived &lt;owner&gt;', '0/1 completed']]);
    }
    assertOwners(await view({ search: '  MATCH\t ONE  ' }), [[1, name, '1/1 completed']]);
    assertOwners(await view({ search: 'literal' }), []);
    const selections = { scope: 'Active', filter: 'All', priorityFilter: 'High', search: 'match',
      dueFrom: '2025-01-02', dueThrough: '2025-01-02', order: 'Title' };
    assertOwners(await view(selections), [[1, name, '1/1 completed'], [2, name, '0/1 completed']]);
    const invalid = await post('/directory/due-range', { ...selections, rangeFrom: '2025-02-29', rangeThrough: '' });
    assertOwners(await invalid.text(), [[1, name, '1/1 completed'], [2, name, '0/1 completed']]);
    assert.equal(snapshot(), before);

    const response = await post('/directory/completion', { ...selections, filter: 'Open', completed: '1' });
    assertOwners(await get(response.headers.get('location')), []);
    assertOwners(await view(selections), [[1, name, '1/1 completed'], [2, name, '1/1 completed']]);
    const reopen = await post('/directory/completion', { ...selections, filter: 'Completed', completed: '0' });
    assertOwners(await get(reopen.headers.get('location')), []);
    assertOwners(await view(selections), [[1, name, '0/1 completed'], [2, name, '0/1 completed']]);
    assertOwners(await view({ filter: 'Deleted' }), [[1, name, '1/1 completed'], [2, name, '0/1 completed']]);
    assertOwners(await view({ scope: 'Archived' }), [[3, 'Archived &lt;owner&gt;', '1/2 completed']]);
    const project = await get('/projects/2');
    assert.match(project, /<option selected>All<\/option>/);
    assert.match(project, /name="search" value=""/);
    assert.match(project, /data-testid="task-row"/);
    const archived = await get('/projects/3');
    assert.match(archived, /Archived project/);
    assert.match(archived, /disabled>Create task/);
    const after = snapshot();
    db.close(); db = undefined;
    await stop();
    await start();
    assertOwners(await view(selections), [[1, name, '0/1 completed'], [2, name, '0/1 completed']]);
    db = new DatabaseSync(dbPath);
    assert.equal(snapshot(), after);
  } finally {
    db?.close();
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
