import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('portable export includes ordered live/deleted state, defaults and LF notes without mutation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const database = join(directory, 'data.sqlite');
  const legacy = new DatabaseSync(database);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects VALUES (1, 'Source  雪 <name>'), (2, 'Destination'), (3, 'Empty');
    INSERT INTO tasks VALUES (1, 1, 'First  TASK', 1), (2, 1, 'Second', 0), (3, 2, 'Other', 0);
  `);
  legacy.close();
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: database }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const post = async (path, values = {}) => {
    const response = await fetch(base + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    assert.equal(response.status, 303);
  };
  const download = async (id, query = '') => {
    const response = await fetch(`${base}/projects/${id}/export${query}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
    return response.json();
  };
  const snapshot = () => {
    const db = new DatabaseSync(database);
    try {
      return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    } finally { db.close(); }
  };
  try {
    await start();
    const initial = await download(1);
    assert.deepEqual(initial, {
      format: 'workboard-project', version: 1,
      project: { name: 'Source  雪 <name>', archived: false, defaultPriority: 'Normal', tasks: [
        { title: 'First  TASK', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
      ] },
    });
    assert.deepEqual((await download(3)).project.tasks, []);
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    const notes = '  雪 😀 <script>&literal</script>\r\nnext\rlast\n  ';
    await post('/projects/1/tasks/1/notes', { notes });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual((await download(2)).project.tasks.map(task => task.title), ['Other', 'First  TASK']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/1/tasks/1/delete');
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Third' });
    await post('/projects/1/archive');
    const query = '?filter=Deleted&priorityFilter=Low&dueFrom=9999-01-01&search=absent';
    const pageBefore = await (await fetch(base + '/projects/1' + query)).text();
    assert.match(pageBefore, /<button type="submit">Download project<\/button>/);
    const before = snapshot();
    const exported = await download(1, query);
    assert.equal(exported.project.archived, true);
    assert.equal(exported.project.defaultPriority, 'Low');
    assert.deepEqual(exported.project.tasks, [
      { title: 'First  TASK', completed: true, priority: 'High', dueDate: '0001-01-01', notes: notes.replace(/\r\n?/g, '\n'), deleted: true },
      initial.project.tasks[1],
      { title: 'Third', completed: false, priority: 'Low', dueDate: '', notes: '', deleted: false },
    ]);
    assert.deepEqual(snapshot(), before);
    assert.equal(await (await fetch(base + '/projects/1' + query)).text(), pageBefore);
    assert.equal((await fetch(base + '/projects/999/export')).status, 404);
    await stop();
    await start();
    assert.deepEqual(await download(1), exported);
    assert.deepEqual(snapshot(), before);
    await post('/projects/1/restore');
    await post('/projects/1/tasks/1/restore');
    assert.deepEqual((await download(1)).project.tasks.map(task => task.title), ['First  TASK', 'Second', 'Third']);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
