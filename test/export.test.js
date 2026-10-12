import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('portable export includes all ordered task state without changing stored data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const dbPath = join(dir, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First  PROJECT'), ('Second'), ('Empty');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Original  TITLE', 1), (1, 'Later', 0), (2, 'Other project', 0);`);
  legacy.close();
  const base = 'http://127.0.0.1:18090';
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '18090', DB_PATH: dbPath }, stdio: 'ignore'
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Server exited');
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Server not ready');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  const exported = async (id, query = '') => {
    const response = await fetch(`${base}/projects/${id}/download${query}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
    assert.match(response.headers.get('content-type'), /application\/json; charset=utf-8/);
    return response.json();
  };
  try {
    await start();
    const defaults = await exported(1);
    assert.deepEqual(defaults, {
      format: 'workboard-project', version: 1,
      project: { name: 'First  PROJECT', archived: false, defaultPriority: 'Normal', tasks: [
        { title: 'Original  TITLE', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        { title: 'Later', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false }
      ] }
    });
    assert.deepEqual((await exported(3)).project.tasks, []);
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    const notes = '  café 🐱 <b>& literal</b>\r\nsecond\rthird\n tail  ';
    await post('/projects/1/tasks/1/notes', { notes });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/1/tasks', { title: 'Newest' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/1/tasks/1/delete');
    await post('/projects/1/default-priority', { priority: 'Low' });
    const query = '?filter=Open&priorityFilter=Low&search=absent&dueFrom=2025-01-01';
    const beforePage = await (await fetch(base + '/projects/1' + query)).text();
    assert.match(beforePage, /<button type="submit">Download project<\/button>/);
    const expected = await exported(1, query);
    assert.deepEqual(expected.project.tasks.map(t => t.title), ['Original  TITLE', 'Later', 'Newest']);
    assert.deepEqual(expected.project.tasks[0], {
      title: 'Original  TITLE', completed: true, priority: 'High', dueDate: '0001-01-01',
      notes: notes.replace(/\r\n?/g, '\n'), deleted: true
    });
    assert.equal(expected.project.defaultPriority, 'Low');
    assert.equal(await (await fetch(base + '/projects/1' + query)).text(), beforePage);
    const check = new DatabaseSync(dbPath);
    assert.equal(check.prepare('SELECT notes FROM tasks WHERE id = 1').get().notes, notes);
    check.close();
    await post('/projects/1/tasks/2/delete');
    await post('/projects/1/tasks/4/delete');
    await post('/projects/1/archive');
    const archived = await exported(1);
    assert.equal(archived.project.archived, true);
    assert.ok(archived.project.tasks.every(t => t.deleted));
    assert.match(await (await fetch(base + '/projects/1')).text(), /<button type="submit">Download project<\/button>/);
    await stop();
    await start();
    assert.deepEqual(await exported(1), archived);
    assert.equal((await fetch(base + '/projects/999/download')).status, 404);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
