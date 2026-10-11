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
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    child.stdout.on('data', data => {
      const match = /listening on port (\d+)/.exec(data.toString());
      if (match) resolve(match[1]);
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exit = once(child, 'exit'); child.kill(); await exit; },
  };
}

test('portable export includes all owned tasks in remembered order without changing data or filters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const dbPath = join(dir, 'db.sqlite');
  let server;
  try {
    // A Task001 database exercises public defaults and non-destructive upgrades.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Original'), ('Other'), ('Empty');
      INSERT INTO tasks (project_id, title, completed) VALUES
        (1, 'First', 1), (1, 'Second', 0), (2, 'Other task', 0);
    `);
    legacy.close();
    server = await start(dbPath);
    const get = path => fetch(server.url + path);
    const post = (path, data = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const download = async id => {
      const response = await get(`/projects/${id}/export`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
      return response.json();
    };
    const original = await download(1);
    assert.deepEqual(original, {
      format: 'workboard-project', version: 1,
      project: { name: 'Original', archived: false, defaultPriority: 'Normal', tasks: [
        { title: 'First', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
      ] },
    });
    assert.deepEqual((await download(3)).project.tasks, []);
    assert.equal((await get('/projects/999/export')).status, 404);
    await post('/projects/1/rename', { name: '  PrÖject  <TAG>  ' });
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/rename', { title: '  FIRST  <b>雪</b>  ' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    const notes = '  α <script>literal</script>\r\nsecond\rthird\nlast  ';
    await post('/projects/1/tasks/1/notes', { notes });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual((await download(1)).project.tasks.map(task => task.title), ['Second']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/1/tasks/1/delete');
    await post('/projects/1/tasks', { title: 'Third' });
    const filteredPath = '/projects/1?filter=Open&priorityFilter=Low&dueFrom=2024-01-01&search=absent';
    const beforeHtml = await (await get(filteredPath)).text();
    assert.ok(!beforeHtml.includes('data-testid="task-row"'));
    assert.match(beforeHtml, /<button type="submit">Download project<\/button>/);
    const db = new DatabaseSync(dbPath);
    const snapshot = () => ({
      projects: db.prepare('SELECT * FROM projects ORDER BY id').all(),
      tasks: db.prepare('SELECT * FROM tasks ORDER BY id').all(),
      positions: db.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all(),
    });
    const beforeData = snapshot();
    const expected = {
      format: 'workboard-project', version: 1,
      project: { name: 'PrÖject  <TAG>', archived: false, defaultPriority: 'Low', tasks: [
        { title: 'FIRST  <b>雪</b>', completed: true, priority: 'High', dueDate: '0001-01-01',
          notes: notes.replace(/\r\n?/g, '\n'), deleted: true },
        { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        { title: 'Third', completed: false, priority: 'Low', dueDate: '', notes: '', deleted: false },
      ] },
    };
    assert.deepEqual(await download(1), expected);
    assert.deepEqual(snapshot(), beforeData);
    assert.equal(await (await get(filteredPath)).text(), beforeHtml);
    assert.equal(db.prepare('SELECT notes FROM tasks WHERE id = 1').get().notes, notes);
    db.close();
    await post('/projects/1/tasks/2/delete');
    await post('/projects/1/tasks/4/delete');
    expected.project.tasks.forEach(task => { task.deleted = true; });
    await post('/projects/1/archive');
    expected.project.archived = true;
    const archivedHtml = await (await get('/projects/1?filter=Deleted')).text();
    assert.match(archivedHtml, /<button type="submit">Download project<\/button>/);
    assert.deepEqual(await download(1), expected);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await download(1), expected);
    assert.deepEqual((await download(2)).project.tasks.map(task => task.title), ['Other task']);
    assert.deepEqual((await download(3)).project.tasks, []);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
