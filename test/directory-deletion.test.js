import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('directory bulk deletion and restoration preserve owners, fields, filters and reserved positions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-directory-deletion-'));
  const dbPath = join(dir, 'db.sqlite');
  let child, db, url;
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
  const post = (path, data = {}) => fetch(url + path, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual' });
  const view = state => get(`/directory?${new URLSearchParams(state)}`);
  const buttonDisabled = (html, label) => new RegExp(`<button[^>]* disabled>${label}</button>`).test(html);
  const titles = html => [...html.matchAll(/data-testid="directory-task-title">([^<]*)<\/span>/g)].map(match => match[1]);
  const task = (title, completed = false, priority = 'High', dueDate = '2025-02-28', deleted = false) =>
    ({ title, completed, priority, dueDate, deleted, notes: '  literal <markup> Ω\nline\t ' });
  const state = { scope: 'Active', filter: 'All', priorityFilter: 'High', dueFrom: '2025-02-28',
    dueThrough: '2025-02-28', search: 'MATCH', order: 'Title' };
  try {
    await start();
    for (const [archived, tasks] of [
      [false, [task('Z match'), task('Outside priority', true, 'Low'), task('Deleted match', true, 'High', '2025-02-28', true)]],
      [false, [task('A match', true), task('Match outside date', false, 'High', ''), task('Other title')]],
      [true, [task('Archived match'), task('Archived deleted match', true, 'High', '2025-02-28', true)]],
    ]) {
      const response = await post('/projects/import', { importedName: 'Same name', json: JSON.stringify({
        format: 'workboard-project', version: 1, project: { name: 'Original', archived, defaultPriority: 'Low', tasks },
      }) });
      assert.equal(response.status, 303);
    }
    db = new DatabaseSync(dbPath);
    const records = () => db.prepare('SELECT * FROM tasks ORDER BY id').all().map(row => ({ ...row }));
    const projects = () => db.prepare('SELECT * FROM projects ORDER BY id').all();
    const positions = () => db.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all();
    const original = records(), originalProjects = projects(), originalPositions = positions();
    let html = await view(state);
    assert.deepEqual(titles(html), ['A match', 'Z match']);
    assert.equal(buttonDisabled(html, 'Delete visible tasks'), false);
    assert.equal(buttonDisabled(html, 'Restore visible tasks'), true);
    const deletion = await post('/directory/deletion', { ...state, deleted: '1' });
    const location = deletion.headers.get('location');
    assert.equal(deletion.status, 303);
    for (const [key, value] of Object.entries(state)) assert.equal(new URL(location, url).searchParams.get(key), value);
    html = await get(location);
    assert.deepEqual(titles(html), []);
    assert.match(html, /data-testid="directory-summary">0\/0 completed/);
    assert.match(html, /No matching tasks/);
    assert.doesNotMatch(html, /data-testid="directory-owner-row"/);
    for (const label of ['Delete visible tasks', 'Restore visible tasks', 'Complete visible tasks', 'Reopen visible tasks']) {
      assert.equal(buttonDisabled(html, label), true);
    }
    assert.deepEqual(records(), original.map(row => [1, 4].includes(row.id) ? { ...row, deleted: 1 } : row));
    assert.deepEqual(projects(), originalProjects);
    assert.deepEqual(positions(), originalPositions);
    html = await get('/');
    assert.match(html, /data-testid="project-summary">1\/1 completed/);
    assert.match(html, /data-testid="project-summary">0\/2 completed/);

    // Forged requests cannot mutate protected scopes or the wrong live/deleted view.
    const afterDeletion = records();
    for (const selections of [{ scope: 'Archived', filter: 'All', deleted: '1' },
      { scope: 'Archived', filter: 'Deleted', deleted: '0' },
      { scope: 'Active', filter: 'Deleted', deleted: '1' },
      { scope: 'Active', filter: 'All', deleted: '0' }]) {
      await post('/directory/deletion', selections);
      assert.deepEqual(records(), afterDeletion);
      html = await view(selections);
      assert.equal(buttonDisabled(html, 'Delete visible tasks'), selections.scope === 'Archived' || selections.filter === 'Deleted');
      assert.equal(buttonDisabled(html, 'Restore visible tasks'), selections.scope === 'Archived' || selections.filter !== 'Deleted');
    }
    await post('/projects/1/tasks', { title: 'Later task' });
    db.close(); db = undefined;
    await stop(); await start();
    db = new DatabaseSync(dbPath);
    assert.deepEqual(records().slice(0, original.length), afterDeletion);
    html = await view({ ...state, filter: 'Deleted' });
    assert.deepEqual(titles(html), ['A match', 'Deleted match', 'Z match']);
    assert.match(html, /data-testid="directory-summary">2\/3 completed/);
    assert.equal((html.match(/data-testid="directory-owner-row"/g) || []).length, 2);
    assert.equal(buttonDisabled(html, 'Restore visible tasks'), false);
    const restore = await post('/directory/deletion', { ...state, filter: 'Deleted', deleted: '0' });
    html = await get(restore.headers.get('location'));
    assert.deepEqual(titles(html), []);
    assert.match(html, /No matching tasks/);
    assert.equal(new URL(restore.headers.get('location'), url).searchParams.get('filter'), 'Deleted');
    assert.deepEqual(records().slice(0, original.length), original.map(row => row.id === 3 ? { ...row, deleted: 0 } : row));
    assert.deepEqual(projects(), originalProjects);
    assert.deepEqual(positions().slice(0, 3), originalPositions.slice(0, 3));
    assert.deepEqual(db.prepare('SELECT id FROM tasks WHERE project_id = 1 ORDER BY position').all().map(row => row.id), [1, 2, 3, 9]);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(records().find(row => row.id === 1), original[0]);
    const final = records(), finalPositions = positions();
    db.close(); db = undefined;
    await stop(); await start();
    db = new DatabaseSync(dbPath);
    assert.deepEqual(records(), final);
    assert.deepEqual(positions(), finalPositions);
    html = await view(state);
    assert.deepEqual(titles(html), ['A match', 'Deleted match', 'Z match']);
    assert.match(html, /data-testid="directory-summary">2\/3 completed/);
  } finally {
    db?.close();
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
