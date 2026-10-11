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
  return { url: `http://127.0.0.1:${port}`, async stop() {
    const exited = once(child, 'exit'); child.kill(); await exited;
  } };
}

test('directory deletion/restoration preserves identities, fields, positions and the full view state', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'workboard-directory-deletion-'));
  const dbPath = join(temp, 'db.sqlite');
  let server;
  let db;
  try {
    server = await start(dbPath);
    db = new DatabaseSync(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = async (path, values = {}) => (await fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    })).text();
    for (const archived of [false, false, true]) {
      await post('/projects/import', { importedName: 'Same owner', projectJson: JSON.stringify({
        format: 'workboard-project', version: 1, project: {
          name: 'Original', archived, defaultPriority: 'Low', tasks: [
            { title: 'MATCH\t  Alpha', completed: true, priority: 'High', dueDate: '2024-02-29', notes: '  雪\n<literal>  ', deleted: false },
            { title: 'Match Beta', completed: false, priority: 'High', dueDate: '2024-03-01', notes: '', deleted: false },
            { title: 'Outside', completed: false, priority: 'Low', dueDate: '', notes: 'match', deleted: false },
            { title: 'Match deleted', completed: true, priority: 'High', dueDate: '2024-02-29', notes: 'kept', deleted: true }
          ]
        }
      }) });
    }
    const tasks = () => db.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task }));
    const positions = () => db.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all();
    const projects = () => db.prepare('SELECT * FROM projects ORDER BY id').all();
    const before = tasks();
    const originalPositions = positions();
    const originalProjects = projects();
    const state = { scope: 'Active', filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29', search: 'match alpha', order: 'Title' };
    const checkButton = (html, label, disabled) => {
      const match = html.match(new RegExp(`<button[^>]*>${label}</button>`));
      assert.ok(match, label);
      assert.equal(match[0].includes(' disabled'), disabled, label);
    };
    let html = await get('/directory?' + new URLSearchParams(state));
    checkButton(html, 'Delete visible tasks', false);
    checkButton(html, 'Restore visible tasks', true);
    assert.equal((html.match(/data-testid="directory-owner-row"/g) || []).length, 2);
    html = await post('/directory/deletion', { ...state, deleted: '1' });
    assert.match(html, /directory-summary">0\/0 completed/);
    assert.match(html, /No matching tasks/);
    assert.doesNotMatch(html, /data-testid="directory-owner-row"/);
    for (const value of ['Completed', 'High', 'Title']) assert.match(html, new RegExp(`<option selected>${value}</option>`));
    for (const value of ['2024-02-29', 'match alpha']) assert.ok(html.includes(`value="${value}"`));
    checkButton(html, 'Delete visible tasks', true);
    checkButton(html, 'Restore visible tasks', true);
    const changedIds = new Set([1, 5]);
    assert.deepEqual(tasks(), before.map(task => changedIds.has(task.id) ? { ...task, deleted: 1 } : task));
    assert.deepEqual(positions(), originalPositions);
    assert.deepEqual(projects(), originalProjects);
    assert.match(await get('/'), /0\/2 completed/);

    const deletedState = { ...state, filter: 'Deleted' };
    html = await get('/directory?' + new URLSearchParams(deletedState));
    assert.match(html, /directory-summary">2\/2 completed/);
    checkButton(html, 'Delete visible tasks', true);
    checkButton(html, 'Restore visible tasks', false);
    checkButton(html, 'Complete visible tasks', true);
    // Forged actions cannot bypass protected scope or live/deleted semantics.
    const afterDeletion = tasks();
    for (const values of [
      { ...state, scope: 'Archived', deleted: '1' },
      { ...deletedState, scope: 'Archived', deleted: '0' },
      { ...state, deleted: '0' },
      { ...deletedState, deleted: '1' },
      { ...state, deleted: 'invalid' }
    ]) await post('/directory/deletion', values);
    assert.deepEqual(tasks(), afterDeletion);
    html = await get('/directory?scope=Archived&filter=Deleted');
    checkButton(html, 'Delete visible tasks', true);
    checkButton(html, 'Restore visible tasks', true);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(tasks(), afterDeletion);
    await post('/projects/1/tasks', { title: 'Later' });
    html = await post('/directory/deletion', { ...deletedState, deleted: '0' });
    assert.match(html, /directory-summary">0\/0 completed/);
    assert.match(html, /No matching tasks/);
    assert.deepEqual(tasks().slice(0, before.length), before);
    assert.deepEqual(positions().filter(position => position.task_id <= before.length), originalPositions);
    html = await get('/projects/1');
    assert.ok(html.indexOf('Complete MATCH') < html.indexOf('Complete Match Beta'));
    assert.ok(html.indexOf('Complete Outside') < html.indexOf('Complete Later'));
    // A restored task still returns to its reserved position after moving.
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(tasks().slice(0, before.length), before);
    // All/Open actions target their matching live records, not deleted records.
    await post('/directory/deletion', { scope: 'Active', filter: 'Open', priorityFilter: 'High', deleted: '1' });
    assert.equal(tasks().filter(task => task.deleted && !task.completed).length, 2);
    await post('/directory/deletion', { scope: 'Active', filter: 'Deleted', priorityFilter: 'High', search: 'beta', deleted: '0' });
    assert.deepEqual(tasks().slice(0, before.length), before);
    await post('/directory/deletion', { ...state, filter: 'All', deleted: '1' });
    await server.stop();
    server = await start(dbPath);
    assert.equal(tasks().find(task => task.id === 1).deleted, 1);
    assert.equal(tasks().find(task => task.id === 5).deleted, 1);
    assert.equal(tasks().find(task => task.id === 9).deleted, 0);
    html = await post('/directory/deletion', { ...deletedState, deleted: '0' });
    assert.match(html, /No matching tasks/);
    assert.deepEqual(tasks().slice(0, before.length), before);
    assert.deepEqual(projects(), originalProjects);
  } finally {
    if (server) await server.stop();
    if (db?.isOpen) db.close();
    await rm(temp, { recursive: true, force: true });
  }
});
