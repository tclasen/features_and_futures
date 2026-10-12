import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('portable export includes ordered live/deleted tasks, defaults and exact text without mutation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const path = join(directory, 'db.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Source  Name'), ('Destination'), ('Empty');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'First  TITLE', 1), (1, 'Second', 0);
  `);
  legacy.close();
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: path }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Server exited')));
      child.stdout.on('data', (data) => {
        const port = String(data).match(/port (\d+)/);
        if (port) resolve(`http://127.0.0.1:${port[1]}`);
      });
    });
  }
  async function stop() {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  try {
    let base = await start();
    const post = (route, data = {}) => fetch(base + route, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const download = async (id) => {
      const response = await fetch(`${base}/projects/${id}/export`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
      return response.json();
    };
    const original = await download(1);
    assert.deepEqual(original, {
      format: 'workboard-project', version: 1,
      project: { name: 'Source  Name', archived: false, defaultPriority: 'Normal', tasks: [
        { title: 'First  TITLE', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
      ] },
    });
    assert.deepEqual((await download(3)).project.tasks, []);
    await post('/projects/2/tasks', { title: 'Other project only' });
    const notes = '  café 😀 <b>&</b>\r\nnext\rfinal\n  ';
    await post('/projects/1/tasks/1/notes', { notes });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/1/tasks/1/delete');
    await post('/projects/1/default-priority', { priority: 'Low' });
    const filteredRoute = '/projects/1?filter=Open&priorityFilter=Low&dueFrom=2024-01-01&search=absent';
    const before = await (await fetch(base + filteredRoute)).text();
    assert.ok(before.includes('>Download project</button>'));
    assert.ok(!before.includes('data-testid="task-row"'));
    const exported = await download(1);
    assert.deepEqual(exported.project.tasks[0], {
      title: 'First  TITLE', completed: true, priority: 'High', dueDate: '0001-01-01',
      notes: notes.replace(/\r\n?/g, '\n'), deleted: true,
    });
    assert.deepEqual(exported.project.tasks[1], original.project.tasks[1]);
    assert.equal(exported.project.tasks.length, 2);
    assert.equal(exported.project.defaultPriority, 'Low');
    assert.equal(await (await fetch(base + filteredRoute)).text(), before);
    await post('/projects/1/tasks/2/delete');
    await post('/projects/1/archive');
    const archivedHtml = await (await fetch(base + '/projects/1?filter=Deleted')).text();
    assert.match(archivedHtml, /<button type="submit">Download project<\/button>/);
    const archived = await download(1);
    assert.equal(archived.project.archived, true);
    assert.ok(archived.project.tasks.every((task) => task.deleted));
    assert.equal((await fetch(base + '/projects/999/export')).status, 404);
    await stop();
    const db = new DatabaseSync(path);
    assert.equal(db.prepare('SELECT notes FROM tasks WHERE id = 1').get().notes, notes);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM task_positions WHERE task_id = 1').get().count, 2);
    db.close();
    base = await start();
    assert.deepEqual(await download(1), archived);
    await post('/projects/1/restore');
    await post('/projects/1/tasks/1/restore');
    const restored = await download(1);
    assert.equal(restored.project.tasks[0].deleted, false);
    assert.equal(restored.project.tasks[0].notes, archived.project.tasks[0].notes);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
