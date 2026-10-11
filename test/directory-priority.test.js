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

test('bulk directory priority targets only matching live active tasks and preserves data and view', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'workboard-directory-priority-'));
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
            { title: 'Outside', completed: false, priority: 'Low', dueDate: '', notes: 'match alpha', deleted: false },
            { title: 'Match Alpha deleted', completed: true, priority: 'High', dueDate: '2024-02-29', notes: 'kept', deleted: true }
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
    const checkButton = (html, disabled) => {
      const match = html.match(/<button[^>]*>Set visible priority<\/button>/);
      assert.ok(match);
      assert.equal(match[0].includes(' disabled'), disabled);
    };
    let html = await get('/directory');
    assert.match(html, /id="visible-tasks-priority" name="priority">\s*<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    checkButton(html, false);
    html = await post('/directory/priority', { ...state, priority: 'Low' });
    checkButton(html, true);
    assert.match(html, /directory-summary">0\/0 completed/);
    assert.match(html, /No matching tasks/);
    assert.doesNotMatch(html, /data-testid="directory-owner-row"/);
    for (const value of ['Completed', 'High', 'Title', 'Low']) assert.match(html, new RegExp(`<option selected>${value}</option>`));
    for (const value of ['2024-02-29', 'match alpha']) assert.ok(html.includes(`value="${value}"`));
    const expected = before.map(task => [1, 5].includes(task.id) ? { ...task, priority: 'Low' } : task);
    assert.deepEqual(tasks(), expected);
    assert.deepEqual(positions(), originalPositions);
    assert.deepEqual(projects(), originalProjects);
    html = await get('/directory?' + new URLSearchParams({ ...state, priorityFilter: 'Low' }));
    assert.match(html, /directory-summary">2\/2 completed/);
    assert.equal((html.match(/directory-owner-row/g) || []).length, 2);
    assert.match(await get('/'), /1\/3 completed/);
    for (const values of [
      { ...state, priorityFilter: 'All', scope: 'Archived', priority: 'Normal' },
      { ...state, priorityFilter: 'All', filter: 'Deleted', priority: 'Normal' },
      { ...state, priorityFilter: 'All', priority: 'invalid' },
      { ...state, priorityFilter: 'All' }
    ]) await post('/directory/priority', values);
    assert.deepEqual(tasks(), expected);
    for (const path of ['/directory?scope=Archived', '/directory?filter=Deleted', '/directory?search=absent']) checkButton(await get(path), true);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(tasks(), expected);
    assert.match(await get('/projects/1'), /<option selected>Low<\/option>/);
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(tasks(), expected);
    await post('/directory/priority', { scope: 'Active', filter: 'Open', priorityFilter: 'High', priority: 'Normal' });
    assert.deepEqual(tasks(), expected.map(task => [2, 6].includes(task.id) ? { ...task, priority: 'Normal' } : task));
    await post('/directory/priority', { scope: 'Active', filter: 'All', priorityFilter: 'Normal', priority: 'High' });
    assert.deepEqual(tasks(), expected);
    assert.deepEqual(projects(), originalProjects);
  } finally {
    if (server) await server.stop();
    if (db?.isOpen) db.close();
    await rm(temp, { recursive: true, force: true });
  }
});
