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
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill(); await exited; }
  };
}

test('portable export includes all current tasks in remembered order without changing data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const dbPath = join(directory, 'db.sqlite');
  let server;
  let db;
  try {
    db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Source  雪'), ('Destination'), ('Empty');
      INSERT INTO tasks (project_id, title, completed) VALUES
        (1, 'Alpha  <tag>', 1), (1, 'Beta', 0), (2, 'Other project', 0);`);
    db.close();
    server = await start(dbPath);
    db = new DatabaseSync(dbPath);
    const get = path => fetch(server.url + path);
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values)
    });
    const exported = async id => {
      const response = await get(`/projects/${id}/export?filter=Deleted&priorityFilter=Low&search=no-match&dueFrom=9999-01-01`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
      return response.json();
    };
    const defaults = title => ({ title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false });
    assert.deepEqual(await exported(1), {
      format: 'workboard-project', version: 1,
      project: { name: 'Source  雪', archived: false, defaultPriority: 'Normal',
        tasks: [{ ...defaults('Alpha  <tag>'), completed: true }, defaults('Beta')] }
    });
    assert.deepEqual((await exported(3)).project.tasks, []);
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    const notes = '  雪 & <script>literal</script>\r\nsecond\rthird\n  ';
    await post('/projects/1/tasks/1/notes', { notes });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    assert.deepEqual((await exported(1)).project.tasks, [defaults('Beta')]);
    assert.deepEqual((await exported(2)).project.tasks.map(task => task.title), ['Other project', 'Alpha  <tag>']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/1/tasks/1/delete');
    await post('/projects/1/tasks', { title: 'Later' });
    await post('/projects/1/archive');
    const state = '/projects/1?filter=Deleted&priorityFilter=High&search=alpha&dueFrom=0001-01-01&dueThrough=0001-01-01';
    const beforePage = await (await get(state)).text();
    assert.match(beforePage, /<button type="submit">Download project<\/button>/);
    const snapshot = () => ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    const document = await exported(1);
    assert.deepEqual(document, {
      format: 'workboard-project', version: 1,
      project: { name: 'Source  雪', archived: true, defaultPriority: 'Low', tasks: [
        { title: 'Alpha  <tag>', completed: true, priority: 'High', dueDate: '0001-01-01',
          notes: notes.replace(/\r\n?/g, '\n'), deleted: true },
        defaults('Beta'), { ...defaults('Later'), priority: 'Low' }
      ] }
    });
    assert.deepEqual(snapshot(), before);
    assert.equal(db.prepare('SELECT notes FROM tasks WHERE id = 1').get().notes, notes);
    assert.equal(await (await get(state)).text(), beforePage);
    await post('/projects/1/restore');
    await post('/projects/1/tasks/2/delete');
    await post('/projects/1/tasks/4/delete');
    assert.ok((await exported(1)).project.tasks.every(task => task.deleted));
    assert.match(await (await get('/projects/1?filter=Deleted')).text(), /<button type="submit">Download project<\/button>/);
    const finalDocument = await exported(1);
    db.close(); db = undefined;
    await server.stop(); server = await start(dbPath);
    assert.deepEqual(await exported(1), finalDocument);
    assert.equal((await get('/projects/999/export')).status, 404);
    assert.deepEqual(await (await get('/health')).json(), { status: 'ok' });
  } finally {
    if (db?.isOpen) db.close();
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
