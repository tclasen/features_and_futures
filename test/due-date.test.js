import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('due dates validate Gregorian days, migrate, preserve task data and filters, and persist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-dates-'));
  const dbPath = join(dir, 'db.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Legacy');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing', 1);`);
  legacy.close();
  let child, url;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Exited ${code}`)); });
      child.stdout.on('data', chunk => {
        const match = chunk.toString().match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  };
  const stop = async () => { const exited = once(child, 'exit'); child.kill(); await exited; child = null; };
  const post = (path, values = {}) => fetch(url + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const page = path => fetch(url + path).then(r => r.text());
  const dateInput = (html, id) => html.match(new RegExp(`<input id="task-due-date-${id}"[^>]*>`))[0];
  const save = value => post('/projects/1/tasks/1/due-date', { dueDate: value, filter: 'Completed', priorityFilter: 'Normal' });
  const filtered = '/projects/1?filter=Completed&priorityFilter=Normal';
  try {
    await start();
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'New task' });
    await post('/projects/2/tasks', { title: 'Other project' });
    assert.match(dateInput(await page('/projects/1'), 1), /value=""/);
    assert.match(dateInput(await page('/projects/1'), 2), /value=""/);
    const before = await page(filtered);
    for (const value of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '2025-04-30']) {
      const response = await save(`  ${value}  `);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), filtered);
      const after = await page(filtered);
      assert.match(dateInput(after, 1), new RegExp(`value="${value}"`));
      assert.equal(after.replace(dateInput(after, 1), ''), before.replace(dateInput(before, 1), ''));
    }
    for (const value of ['0000-01-01', '10000-01-01', '1900-02-29', '2025-02-29', '2024-02-30', '2025-04-31', '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32', '2025-1-01', '25-01-01', '2025-01-01T00:00:00Z', '<bad>']) {
      const response = await save(value);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /role="alert">Due date must be a valid YYYY-MM-DD date/);
      assert.match(dateInput(html, 1), /value="2025-04-30"/);
      assert.match(html, /<option selected>Completed/);
      assert.match(html, /<option selected>Normal/);
    }
    assert.equal((await post('/projects/2/tasks/1/due-date', { dueDate: '2025-01-01' })).status, 404);
    assert.match(dateInput(await page('/projects/2'), 3), /value=""/);
    await post('/projects/1/tasks/2/due-date', { dueDate: '2026-12-31' });
    await post('/projects/1/tasks/1/rename', { title: 'Renamed' });
    assert.match(dateInput(await page(filtered), 1), /value="2025-04-30"/);
    assert.match(await page('/'), /1\/2 completed/);
    let detail = await page('/projects/1');
    await stop(); await start();
    assert.equal(await page('/projects/1'), detail);
    await post('/projects/1/archive');
    detail = await page('/projects/1');
    for (const id of [1, 2]) assert.match(dateInput(detail, id), / disabled/);
    assert.equal((detail.match(/<button type="submit" disabled>Save due date/g) || []).length, 2);
    assert.equal((await save('2027-01-01')).status, 403);
    assert.match(dateInput(await page(filtered), 1), /value="2025-04-30"/);
    await stop(); await start();
    assert.equal(await page('/projects/1'), detail);
    await post('/projects/1/restore');
    assert.doesNotMatch(dateInput(await page('/projects/1'), 1), / disabled/);
    await save('   ');
    assert.match(dateInput(await page(filtered), 1), /value=""/);
    assert.match(dateInput(await page('/projects/1'), 2), /value="2026-12-31"/);
    await save('2028-02-29');
    await save('');
    detail = await page('/projects/1');
    await stop(); await start();
    assert.equal(await page('/projects/1'), detail);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
