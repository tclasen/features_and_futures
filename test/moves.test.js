import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const titles = html => [...html.matchAll(/data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(m => m[1]);
const moveForm = (html, id) => html.match(new RegExp(`<form method="post" action="/projects/\\d+/tasks/${id}/move">([\\s\\S]*?)</form>`))[1];

test('moves append, retain all task data and source filters, validate destinations, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const dbPath = join(directory, 'db.sqlite');
  // Exercise migration from the original task ordering schema.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source');
    INSERT INTO tasks (project_id, title) VALUES (1, 'First'), (1, 'Second');`);
  legacy.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited ${code}`)));
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  }
  async function stop() { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; child = null; }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, body = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(body), redirect: 'manual' });
  try {
    await start();
    assert.deepEqual(titles(await get('/projects/1')), ['First', 'Second']);
    assert.match(moveForm(await get('/projects/1'), 1), /<select[^>]+ disabled>/);
    assert.match(moveForm(await get('/projects/1'), 1), /<button[^>]+ disabled>Move task/);
    for (const name of ['Destination', 'Other', 'Archived']) await post('/projects', { name });
    await post('/projects/4/archive');
    await post('/projects/2/rename', { name: 'Renamed & destination' });
    let form = moveForm(await get('/projects/1'), 1);
    assert.deepEqual([...form.matchAll(/<option value="(\d+)">(.*?)<\/option>/g)].map(m => [m[1], m[2]]), [['2', 'Renamed &amp; destination'], ['3', 'Other']]);
    await post('/projects/2/tasks', { title: 'Destination first' });
    await post('/projects/2/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-01', dueThrough: '2024-03-01' };
    const location = '/projects/1?' + new URLSearchParams(filters);
    form = moveForm(await get(location), 1);
    for (const [key, value] of Object.entries(filters)) assert.ok(form.includes(`name="${key}" value="${value}"`));
    for (const destination of ['1', '4', '999', '']) {
      assert.equal((await post('/projects/1/tasks/1/move', { ...filters, destination })).status, 422);
      assert.deepEqual(titles(await get(location)), ['First']);
    }
    let response = await post('/projects/1/tasks/1/move', { ...filters, destination: '2' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual(titles(await get(location)), []);
    assert.deepEqual(titles(await get('/projects/1')), ['Second']);
    assert.deepEqual(titles(await get('/projects/2')), ['Destination first', 'First']);
    let html = await get('/projects/2');
    assert.match(html, /aria-label="Complete First" checked/);
    assert.match(html, /<option selected>High<\/option>/);
    assert.match(html, /name="dueDate" type="text" value="2024-02-29"/);
    assert.match(await get('/'), /0\/1 completed/);
    assert.match(await get('/'), /1\/2 completed/);
    await stop(); await start();
    assert.deepEqual(titles(await get('/projects/2')), ['Destination first', 'First']);
    await post('/projects/2/tasks/1/rename', { title: 'Moved renamed' });
    await post('/projects/2/archive');
    html = await get('/projects/2');
    assert.match(moveForm(html, 1), /<select[^>]+ disabled>/);
    assert.equal((await post('/projects/2/tasks/1/move', { destination: '1' })).status, 403);
    await post('/projects/2/restore');
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(titles(await get('/projects/1')), ['Second', 'Moved renamed']);
    // Blank dates and new tasks also retain ordering after repeat moves.
    await post('/projects/1/tasks/2/move', { destination: '2' });
    await post('/projects/1/tasks', { title: 'New after move' });
    assert.deepEqual(titles(await get('/projects/1')), ['Moved renamed', 'New after move']);
    assert.deepEqual(titles(await get('/projects/2')), ['Destination first', 'Second']);
    assert.match(await get('/projects/2'), /name="dueDate" type="text" value=""/);
    assert.equal((await post('/projects/1/tasks/2/move', { destination: '3' })).status, 404);
    await stop(); await start();
    assert.deepEqual(titles(await get('/projects/1')), ['Moved renamed', 'New after move']);
    html = await get('/projects/1');
    assert.match(html, /aria-label="Complete Moved renamed" checked/);
    assert.match(html, /name="dueDate" type="text" value="2024-02-29"/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
