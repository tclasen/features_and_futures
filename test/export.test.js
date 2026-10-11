import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    child.once('exit', code => reject(new Error(`Server exited ${code}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.stderr.on('data', () => {});
  });
  return { url, stop: () => new Promise(resolve => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
  }) };
}

test('portable export includes ordered live/deleted state without mutating data or filters', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  let server;
  try {
    const path = join(directory, 'workboard.sqlite');
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (name) VALUES ('Original  PROJECT 雪'), ('Other'), ('Empty');
      INSERT INTO tasks (project_id, title, completed) VALUES
        (1, 'First  Title', 1), (1, 'Second', 0), (2, 'Unrelated', 0);
    `);
    legacy.close();
    server = await start(path);
    const get = route => fetch(server.url + route);
    const post = (route, data = {}) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const exportProject = async id => {
      const response = await get(`/projects/${id}/export`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
      return response.json();
    };
    const defaults = { title: 'First  Title', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false };
    assert.deepEqual((await exportProject(1)).project.tasks[0], defaults);
    assert.deepEqual((await exportProject(3)).project.tasks, []);
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '0001-01-01' });
    const notes = '  <script>literal & markup</script> 雪\r\n\r\n next\rfinal\n  ';
    await post('/projects/1/tasks/1/notes', { notes });
    await post('/projects/1/tasks/1/move', { destination: '2' });
    await post('/projects/2/tasks/1/move', { destination: '1' });
    await post('/projects/1/tasks/1/delete');
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/tasks', { title: 'Third' });
    const filtered = '/projects/1?filter=Deleted&priorityFilter=Low&dueFrom=2025-01-01&search=absent';
    const beforePage = await (await get(filtered)).text();
    assert.match(beforePage, /<button type="submit">Download project<\/button>/);
    assert.ok(!beforePage.includes('data-testid="task-row"'));
    const snapshot = () => {
      const db = new DatabaseSync(path);
      try {
        return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
      } finally { db.close(); }
    };
    const beforeData = snapshot();
    const expected = {
      format: 'workboard-project', version: 1,
      project: {
        name: 'Original  PROJECT 雪', archived: false, defaultPriority: 'Low',
        tasks: [
          { ...defaults, priority: 'High', dueDate: '0001-01-01', notes: notes.replace(/\r\n?/g, '\n'), deleted: true },
          { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
          { title: 'Third', completed: false, priority: 'Low', dueDate: '', notes: '', deleted: false },
        ],
      },
    };
    assert.deepEqual(await exportProject(1), expected);
    assert.deepEqual(snapshot(), beforeData);
    assert.equal(await (await get(filtered)).text(), beforePage);
    await post('/projects/1/tasks/2/delete');
    await post('/projects/1/tasks/4/delete');
    await post('/projects/1/archive');
    expected.project.archived = true;
    expected.project.tasks.forEach(task => { task.deleted = true; });
    const archivedPage = await (await get('/projects/1?filter=Deleted')).text();
    assert.match(archivedPage, /<button type="submit">Download project<\/button>/);
    assert.deepEqual(await exportProject(1), expected);
    await server.stop();
    server = await start(path);
    assert.deepEqual(await exportProject(1), expected);
    assert.deepEqual((await exportProject(2)).project.tasks.map(task => task.title), ['Unrelated']);
    assert.equal((await get('/projects/999/export')).status, 404);
    assert.deepEqual(await (await get('/health')).json(), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
