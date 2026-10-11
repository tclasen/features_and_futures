import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function launch(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited ${code}`)));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('due dates validate calendar days, migrate, remain independent and survive all other edits', async () => {
  const directory = await mkdtemp(path.resolve('data/due-date-test-'));
  const databasePath = path.join(directory, 'workboard.sqlite');
  const oldDb = new DatabaseSync(databasePath);
  oldDb.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Old task', 1);`);
  oldDb.close();
  let server;
  try {
    server = await launch(databasePath);
    const post = (route, values = {}) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (route) => (await fetch(server.url + route)).text();
    const dateInput = (markup, id) => markup.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))[0];
    assert.match(dateInput(await html('/projects/1'), 1), /type="text" value=""/);
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects', { name: 'Other project' });
    await post('/projects/2/tasks', { title: 'Other task' });
    assert.match(dateInput(await html('/projects/1'), 2), /value=""/);
    const selections = { filter: 'Completed', priorityFilter: 'Normal' };
    const route = '/projects/1?filter=Completed&priorityFilter=Normal';
    const summary = await html('/');
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '  2026-04-30  ']) {
      const response = await post('/projects/1/tasks/1/due-date', { dueDate: date, ...selections });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), route);
      assert.match(dateInput(await html(route), 1), new RegExp(`value="${date.trim()}"`));
    }
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-1-01', '2026-01-1', '2026-01-01T00:00:00Z', 'not a date', '<script>']) {
      const response = await post('/projects/1/tasks/1/due-date', { dueDate: date, ...selections });
      assert.equal(response.status, 200);
      const markup = await response.text();
      assert.match(markup, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(dateInput(markup, 1), /value="2026-04-30"/);
      assert.match(markup, /<option selected>Completed<\/option>/);
      assert.match(markup, /id="priority-filter"[^>]*>\s*<option>All<\/option><option>Low<\/option><option selected>Normal/);
      assert.doesNotMatch(markup, /aria-label="Complete New task"/);
    }
    assert.equal(await html('/'), summary);
    assert.match(dateInput(await html('/projects/1'), 2), /value=""/);
    assert.match(dateInput(await html('/projects/2'), 3), /value=""/);
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2026-01-01' })).status, 404);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1', {});
    await post('/projects/1/default-priority', { priority: 'Low' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    await server.stop();
    server = await launch(databasePath);
    assert.match(dateInput(await html('/projects/1'), 1), /value="2026-04-30"/);
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(dateInput(archived, 1), /value="2026-04-30" disabled/);
    assert.match(dateInput(archived, 2), /value="" disabled/);
    assert.equal((archived.match(/<button type="submit" disabled>Save due date/g) || []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/due-date', { dueDate: '' })).status, 403);
    await server.stop();
    server = await launch(databasePath);
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(dateInput(await html('/projects/1'), 1), /disabled/);
    for (const empty of ['', '  \t ']) {
      await post('/projects/1/tasks/1/due-date', { dueDate: '2024-01-01' });
      await post('/projects/1/tasks/1/due-date', { dueDate: empty });
      assert.match(dateInput(await html('/projects/1'), 1), /value=""/);
    }
    await server.stop();
    server = await launch(databasePath);
    assert.match(dateInput(await html('/projects/1'), 1), /value=""/);
    const db = new DatabaseSync(databasePath);
    assert.deepEqual({ ...db.prepare('SELECT project_id, title, completed, priority, due_date FROM tasks WHERE id = 1').get() }, {
      project_id: 1, title: 'Renamed', completed: 0, priority: 'High', due_date: '',
    });
    db.close();
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
