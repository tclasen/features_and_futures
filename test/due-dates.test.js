import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('due dates validate Gregorian days and persist independently through migration, edits, archives and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
      default_priority TEXT NOT NULL DEFAULT 'Normal');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO projects (name) VALUES ('Existing project');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES (1, 'Existing task', 1, 'High');
  `);
  legacy.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Startup timed out')), 5000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const done = once(child, 'exit');
    child.kill('SIGTERM');
    await done;
    child = undefined;
  }
  async function api(path, method = 'GET', body, status = 200) {
    const response = await fetch(`${base}/api/projects${path}`, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    assert.equal(response.status, status);
    return response.json();
  }
  const save = (value, status = 200) => api('/1/tasks/1', 'PATCH', { due_date: value }, status);
  try {
    await start();
    const original = { id: 1, title: 'Existing task', completed: true, priority: 'High', due_date: '' };
    assert.deepEqual(await api('/1/tasks'), [original]);
    const secondTask = await api('/1/tasks', 'POST', { title: 'Another task' }, 201);
    assert.equal(secondTask.due_date, '');
    const secondProject = await api('', 'POST', { name: 'Other project' }, 201);
    const otherTask = await api(`/${secondProject.id}/tasks`, 'POST', { title: 'Other task' }, 201);
    assert.equal(otherTask.due_date, '');
    const summary = await api('');
    for (const value of ['0001-01-01', '9999-12-31', '0004-02-29', '1600-02-29', '2000-02-29', '2024-02-29', '2025-04-30']) {
      assert.deepEqual(await save(`  ${value}\t`), { ...original, due_date: value });
    }
    const saved = { ...original, due_date: '2025-04-30' };
    for (const value of [
      '0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '0001-02-29', '2025-02-29',
      '2024-02-30', '2025-04-31', '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32',
      '2025-1-01', '25-01-01', '2025-01-1', '2025/01/01', '2025-01-01T00:00:00Z',
      '2025-01-01\nextra', 'tomorrow', null, 20250101, true,
    ]) {
      assert.deepEqual(await save(value, 400), { error: 'Due date must be a valid YYYY-MM-DD date' });
      assert.deepEqual(await api('/1/tasks'), [saved, secondTask]);
    }
    assert.deepEqual(await api(''), summary);
    assert.deepEqual(await api(`/${secondProject.id}/tasks`), [otherTask]);
    await api(`/${secondProject.id}/tasks/1`, 'PATCH', { due_date: '2025-01-01' }, 404);
    assert.deepEqual(await api('/1/tasks'), [saved, secondTask]);
    let edited = await api('/1/tasks/1', 'PATCH', { title: 'Renamed task' });
    assert.deepEqual(edited, { ...saved, title: 'Renamed task' });
    edited = await api('/1/tasks/1', 'PATCH', { priority: 'Low' });
    assert.deepEqual(edited, { ...saved, title: 'Renamed task', priority: 'Low' });
    edited = await api('/1/tasks/1', 'PATCH', { completed: false });
    assert.equal(edited.due_date, saved.due_date);
    await api('/1', 'PATCH', { default_priority: 'High' });
    await api('/1', 'PATCH', { name: 'Renamed project' });
    await api('/1', 'PATCH', { archived: true });
    await save('', 409);
    await save('2026-01-01', 409);
    await stop();
    await start();
    assert.equal((await api('/1')).archived, 1);
    assert.deepEqual(await api('/1/tasks'), [edited, secondTask]);
    assert.deepEqual(await api(`/${secondProject.id}/tasks`), [otherTask]);
    assert.equal((await fetch(`${base}/projects/1`)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: 'ok' });
    await api('/1', 'PATCH', { archived: false });
    assert.deepEqual(await save(' \t\n'), { ...edited, due_date: '' });
    await stop();
    await start();
    assert.deepEqual(await api('/1/tasks'), [{ ...edited, due_date: '' }, secondTask]);
    assert.deepEqual(await save('0001-01-01'), { ...edited, due_date: '0001-01-01' });
    assert.deepEqual(await save(''), { ...edited, due_date: '' });
    const nextTask = await api('/1/tasks', 'POST', { title: 'New high task' }, 201);
    assert.equal(nextTask.priority, 'High');
    assert.equal(nextTask.due_date, '');
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
