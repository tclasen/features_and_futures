import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server.js';

test('portable exports include all current tasks in remembered order without modifying state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const dbPath = join(directory, 'database.sqlite');
  let server;
  let url;
  const start = async () => {
    server = createApplication(dbPath);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const post = (path, values = {}) => fetch(`${url}${path}`, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    try {
      return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    } finally { db.close(); }
  };
  const download = async id => {
    const response = await fetch(`${url}/projects/${id}/download`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
    return response.json();
  };
  try {
    // Simulate an early database: public defaults are supplied by existing migrations.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Old  Project'), ('Other'), ('Empty');
      INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Old\t Task', 1), (1, 'Second', 0), (2, 'Other task', 0);`);
    legacy.close();
    await start();
    assert.deepEqual(await download(1), {
      format: 'workboard-project', version: 1,
      project: { name: 'Old  Project', archived: false, defaultPriority: 'Normal', tasks: [
        { title: 'Old\t Task', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
      ] },
    });
    assert.deepEqual((await download(3)).project.tasks, []);
    const notes = '  雪 📝 <script>&</script>\r\nsecond\rthird\n  ';
    await post('/projects/1/tasks/1/notes', { notes });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    await post('/projects/1/tasks/1/move', { destinationId: '2' });
    await post('/projects/1/tasks', { title: 'Third' });
    await post('/projects/2/tasks/1/rename', { title: 'Changed  TITLE' });
    await post('/projects/2/tasks/1/move', { destinationId: '1' });
    await post('/projects/1/tasks/2/delete');
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/rename', { name: 'Renamed  Café' });
    const filteredPath = '/projects/1?filter=Deleted&priorityFilter=Low&rangeFrom=2025-01-01&search=missing';
    const beforePage = await (await fetch(`${url}${filteredPath}`)).text();
    assert.doesNotMatch(beforePage, /data-testid="task-row"/);
    assert.match(beforePage, /action="\/projects\/1\/download"><button type="submit">Download project/);
    const before = snapshot();
    const exported = await download(1);
    assert.deepEqual(exported, {
      format: 'workboard-project', version: 1,
      project: { name: 'Renamed  Café', archived: false, defaultPriority: 'Low', tasks: [
        { title: 'Changed  TITLE', completed: true, priority: 'High', dueDate: '0001-01-01', notes: notes.replace(/\r\n?/g, '\n'), deleted: false },
        { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: true },
        { title: 'Third', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
      ] },
    });
    assert.deepEqual(snapshot(), before);
    assert.equal(await (await fetch(`${url}${filteredPath}`)).text(), beforePage);
    assert.equal((await download(2)).project.tasks.length, 1);
    await post('/projects/1/tasks/1/delete');
    await post('/projects/1/tasks/4/delete');
    await post('/projects/1/archive');
    const archivedPage = await (await fetch(`${url}/projects/1`)).text();
    assert.match(archivedPage, /action="\/projects\/1\/download"><button type="submit">Download project/);
    const archivedExport = await download(1);
    assert.equal(archivedExport.project.archived, true);
    assert.ok(archivedExport.project.tasks.every(task => task.deleted));
    const archivedState = snapshot();
    await stop();
    await start();
    assert.deepEqual(await download(1), archivedExport);
    assert.deepEqual(snapshot(), archivedState);
    assert.equal(snapshot()[1][0].notes, notes);
    assert.equal((await fetch(`${url}/projects/999/download`)).status, 404);
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
