import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function assertSummary(html, completed, total) {
  const summaries = [...html.matchAll(/data-testid="directory-summary">([^<]*)<\/p>/g)];
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0][1], `${completed}/${total} completed`);
  assert.equal((html.match(/data-testid="directory-task-row"/g) || []).length, total);
  assert.equal(html.includes('id="directory-empty" role="status">No matching tasks'), total === 0);
}

test('directory summary counts only resolved matches across scopes, filters, orders and bulk updates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-summary-'));
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
    ({ title, completed, priority, dueDate, deleted, notes: 'Do not match notes' });
  try {
    await start();
    assertSummary(await get('/directory'), 0, 0);
    const importProject = async (name, archived, tasks) => {
      const response = await post('/projects/import', { importedName: name, json: JSON.stringify({
        format: 'workboard-project', version: 1, project: { name, archived, defaultPriority: 'Normal', tasks },
      }) });
      assert.equal(response.status, 303);
    };
    await importProject('First', false, [
      task('Alpha  One', false, 'High', '2025-01-01'),
      task('ALPHA\tTwo', true, 'High', '2025-01-02'),
      task('Other', true), task('Deleted Alpha', true, 'High', '2025-01-01', true),
    ]);
    await importProject('Second', false, [
      task('Alpha Three', false, 'High', '2025-01-02'), task('Other second', false, 'Low'),
      task('Deleted Alpha second', false, 'High', '2025-01-02', true),
    ]);
    await importProject('Archived', true, [
      task('Alpha archived', true, 'High', '2025-01-02'), task('Other archived', false),
      task('Deleted archived', false, 'Low', '', true),
    ]);
    db = new DatabaseSync(dbPath);
    const snapshot = () => JSON.stringify({
      projects: db.prepare('SELECT * FROM projects ORDER BY id').all(),
      tasks: db.prepare('SELECT * FROM tasks ORDER BY id').all(),
      positions: db.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all(),
    });
    const before = snapshot();
    for (const order of ['Original', 'Priority', 'Due date', 'Title']) {
      assertSummary(await view({ order }), 2, 5);
      assertSummary(await view({ order, filter: 'Open' }), 0, 3);
      assertSummary(await view({ order, filter: 'Completed' }), 2, 2);
      assertSummary(await view({ order, filter: 'Deleted' }), 1, 2);
      assertSummary(await view({ order, scope: 'Archived' }), 1, 2);
      assertSummary(await view({ order, scope: 'Archived', filter: 'Deleted' }), 0, 1);
    }
    assertSummary(await view({ priorityFilter: 'High' }), 1, 3);
    assertSummary(await view({ search: '  alpha\t one  ' }), 0, 1);
    assertSummary(await view({ search: 'Do not match notes' }), 0, 0);
    const selection = { scope: 'Active', filter: 'All', priorityFilter: 'High', search: 'alpha',
      dueFrom: '2025-01-02', dueThrough: '2025-01-02', order: 'Title' };
    assertSummary(await view(selection), 1, 2);
    assertSummary(await view({ ...selection, filter: 'Deleted' }), 0, 1);
    const invalid = await post('/directory/due-range', { ...selection, rangeFrom: '2025-02-29', rangeThrough: '' });
    const invalidHtml = await invalid.text();
    assert.match(invalidHtml, /Due range must use valid/);
    assertSummary(invalidHtml, 1, 2);
    assert.equal(snapshot(), before); // Counting and ordering never write data.

    const complete = await post('/directory/completion', { ...selection, filter: 'Open', completed: '1' });
    const resolved = await get(complete.headers.get('location'));
    assertSummary(resolved, 0, 0);
    assert.match(resolved, /<option selected>Title/);
    assertSummary(await view(selection), 2, 2);
    assertSummary(await get('/directory'), 3, 5);
    const reopen = await post('/directory/completion', { ...selection, filter: 'Completed', completed: '0' });
    assertSummary(await get(reopen.headers.get('location')), 0, 0);
    assertSummary(await view(selection), 0, 2);
    assertSummary(await view({ scope: 'Archived' }), 1, 2);
    assertSummary(await view({ filter: 'Deleted' }), 1, 2);
    const home = await get('/');
    assert.match(home, /data-testid="project-summary">1\/3 completed/);
    assert.match(home, /data-testid="project-summary">0\/2 completed/);
    const after = snapshot();
    db.close(); db = undefined;
    await stop();
    await start();
    assertSummary(await get('/directory'), 1, 5);
    assertSummary(await view(selection), 0, 2);
    db = new DatabaseSync(dbPath);
    assert.equal(snapshot(), after);
  } finally {
    db?.close();
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
