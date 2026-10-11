import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('bulk directory priority intersects all filters and preserves protected records and positions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-directory-priority-'));
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
  const post = (path, data) => fetch(url + path, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual' });
  const task = (title, extra = {}) => ({ title, completed: false, priority: 'High', dueDate: '2024-02-29',
    notes: '  literal <markup> Ω\nline\t ', deleted: false, ...extra });
  const state = { scope: 'Active', filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29',
    dueThrough: '2024-02-29', search: ' MATCH ', order: 'Priority' };
  try {
    await start();
    for (const [archived, tasks] of [
      [false, [task('Z match'), task('Completed match', { completed: true }), task('Deleted match', { deleted: true }),
        task('Low match', { priority: 'Low' }), task('Undated match', { dueDate: '' }), task('Other')]],
      [false, [task('A match')]], [true, [task('Archived match')]],
    ]) {
      assert.equal((await post('/projects/import', { importedName: 'Same name', json: JSON.stringify({
        format: 'workboard-project', version: 1, project: { name: 'Original', archived, defaultPriority: 'High', tasks },
      }) })).status, 303);
    }
    db = new DatabaseSync(dbPath);
    const records = () => db.prepare('SELECT * FROM tasks ORDER BY id').all().map(row => ({ ...row }));
    const projects = () => db.prepare('SELECT * FROM projects ORDER BY id').all();
    const positions = () => db.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all();
    const original = records(), originalProjects = projects(), originalPositions = positions();
    let html = await get('/directory');
    assert.match(html, /<label for="visible-tasks-priority">Visible tasks priority<\/label>/);
    assert.match(html, /id="visible-tasks-priority" name="priority">\s*<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    html = await get(`/directory?${new URLSearchParams(state)}`);
    assert.doesNotMatch(html, /<button[^>]* disabled>Set visible priority/);
    for (const override of [{ scope: 'Archived' }, { filter: 'Deleted' }, { search: 'not present' }]) {
      const protectedState = { ...state, ...override };
      html = await get(`/directory?${new URLSearchParams(protectedState)}`);
      assert.match(html, /<button[^>]* disabled>Set visible priority/);
      await post('/directory/priority', { ...protectedState, priority: 'Low' });
      assert.deepEqual(records(), original);
    }
    for (const priority of [undefined, '', 'Urgent', 'low']) {
      const form = { ...state };
      if (priority !== undefined) form.priority = priority;
      await post('/directory/priority', form);
      assert.deepEqual(records(), original);
    }
    const response = await post('/directory/priority', { ...state, priority: 'Low' });
    assert.equal(response.status, 303);
    const location = response.headers.get('location');
    const params = new URL(location, url).searchParams;
    for (const [key, value] of Object.entries(state)) assert.equal(params.get(key), key === 'search' ? value.trim() : value);
    assert.equal(params.get('visiblePriority'), 'Low');
    html = await get(location);
    assert.match(html, /data-testid="directory-summary">0\/0 completed/);
    assert.match(html, /No matching tasks/);
    assert.doesNotMatch(html, /data-testid="directory-owner-row"/);
    for (const label of ['Set visible priority', 'Complete visible tasks', 'Reopen visible tasks', 'Delete visible tasks', 'Restore visible tasks']) {
      assert.match(html, new RegExp(`<button[^>]* disabled>${label}</button>`));
    }
    assert.deepEqual(records(), original.map(row => [1, 7].includes(row.id) ? { ...row, priority: 'Low' } : row));
    assert.deepEqual(projects(), originalProjects);
    assert.deepEqual(positions(), originalPositions);
    html = await get(`/directory?${new URLSearchParams({ ...state, priorityFilter: 'Low' })}`);
    assert.equal((html.match(/data-testid="directory-owner-row"/g) || []).length, 2);
    assert.match(html, /data-testid="directory-summary">0\/3 completed/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(records()[0], { ...original[0], priority: 'Low' });
    const saved = records(), savedPositions = positions();
    db.close(); db = undefined;
    await stop(); await start();
    db = new DatabaseSync(dbPath);
    assert.deepEqual(records(), saved);
    assert.deepEqual(positions(), savedPositions);
    assert.deepEqual(projects(), originalProjects);
    html = await get('/directory');
    assert.match(html, /<option selected>Normal<\/option>/);
    // All and Completed are also live, eligible intersections.
    await post('/directory/priority', { scope: 'Active', filter: 'Completed', priority: 'Normal' });
    assert.equal(records()[1].priority, 'Normal');
    await post('/directory/priority', { scope: 'Active', filter: 'All', priority: 'Normal' });
    for (const row of records()) assert.equal(row.priority, row.deleted || row.project_id === 3 ? 'High' : 'Normal');
  } finally {
    db?.close();
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
