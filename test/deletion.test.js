import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('deleted tasks migrate live, retain fields and positions, intersect filters, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-deletion-'));
  const dbPath = join(directory, 'db.sqlite');
  const seed = new DatabaseSync(dbPath);
  seed.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source'), ('Destination');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'First', 1), (1, 'Second', 0);`);
  seed.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.on('error', reject);
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
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    try { return db.prepare('SELECT * FROM tasks ORDER BY id').all().map(task => ({ ...task })); } finally { db.close(); }
  };
  const rows = html => (html.match(/data-testid="task-row"/g) || []).length;
  try {
    await start();
    assert.ok(snapshot().every(task => task.deleted === 0));
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    await post('/projects/1/tasks/1/notes', { notes: '  saved\n日本語 <b>literal</b>  ' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    const before = snapshot();
    const filters = { filter: 'Completed', priorityFilter: 'High', dueFrom: '0001-01-01', dueThrough: '9999-12-31', search: 'first' };
    const response = await post('/projects/1/tasks/1/delete', filters);
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High&dueFrom=0001-01-01&dueThrough=9999-12-31&search=first');
    assert.deepEqual(snapshot(), before.map(task => task.id === 1 ? { ...task, deleted: 1 } : task));
    assert.equal(rows(await get(response.headers.get('location'))), 0);
    assert.equal(rows(await get('/projects/1')), 1);
    assert.equal(rows(await get('/projects/1?filter=Completed')), 0);
    assert.ok((await get('/')).includes('0/1 completed'));
    let html = await get('/projects/1?filter=Deleted&priorityFilter=High&dueFrom=0001-01-01&search=FIRST');
    assert.equal(rows(html), 1);
    assert.ok(html.includes('<fieldset class="task-controls" disabled>'));
    assert.ok(html.includes('>Restore task</button>'));
    assert.equal(rows(await get('/projects/1?filter=Deleted&priorityFilter=Low')), 0);
    assert.equal(rows(await get('/projects/1?filter=Deleted&dueFrom=0001-01-02')), 0);
    assert.equal(rows(await get('/projects/1?filter=Deleted&search=saved')), 0);
    for (const [action, body] of [['', { completed: '0' }], ['/rename', { title: 'changed' }], ['/priority', { priority: 'Low' }], ['/due-date', { dueDate: '' }], ['/notes', { notes: '' }], ['/move', { destination: '2' }]]) {
      assert.equal((await post(`/projects/1/tasks/1${action}`, body)).status, 403);
    }
    await post('/projects/1/tasks/2/delete');
    assert.ok((await get('/')).includes('0/0 completed'));
    await post('/projects/1/tasks', { title: 'Third' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/archive');
    html = await get('/projects/1?filter=Deleted');
    assert.equal(rows(html), 2);
    assert.ok(html.includes('disabled>Restore task</button>'));
    assert.equal((await post('/projects/1/tasks/1/restore')).status, 403);
    assert.equal((await post('/projects/1/tasks/3/delete')).status, 403);
    await stop(); await start();
    assert.equal(snapshot()[0].deleted, 1);
    await post('/projects/1/restore');
    const restored = await post('/projects/1/tasks/1/restore', { ...filters, filter: 'Deleted' });
    assert.ok(restored.headers.get('location').includes('filter=Deleted'));
    assert.equal(rows(await get(restored.headers.get('location'))), 0);
    await post('/projects/1/tasks/2/restore');
    assert.deepEqual(snapshot().slice(0, 2), before);
    html = await get('/projects/1');
    assert.ok(html.indexOf('<span>First</span>') < html.indexOf('<span>Second</span>'));
    assert.ok(html.indexOf('<span>Second</span>') < html.indexOf('<span>Third</span>'));
    assert.ok((await get('/')).includes('1/3 completed'));
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await stop(); await start();
    assert.deepEqual(snapshot().slice(0, 2), before);
    assert.equal(rows(await get('/projects/1?filter=Deleted')), 0);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
