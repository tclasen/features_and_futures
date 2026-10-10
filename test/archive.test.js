import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('migrates existing projects, archives read-only tasks, restores, and persists summaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'db.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO projects (name) VALUES ('Existing');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);`);
  database.close();
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: databasePath },
      stdio: ['ignore', 'pipe', 'inherit'],
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
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const rows = html => (html.match(/data-testid="project-row"/g) ?? []).length;
  try {
    await start();
    const initial = await get('/');
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option>/);
    assert.match(initial, /data-testid="project-summary">1\/2 completed/);
    assert.match(initial, />Archive project<\/button>/);
    await post('/projects', { name: 'New' });
    assert.match(await get('/'), /data-testid="project-summary">0\/0 completed/);
    await post('/projects/1/archive');
    assert.equal(rows(await get('/')), 1);
    const archivedList = await get('/?filter=Archived');
    assert.equal(rows(archivedList), 1);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    assert.match(archivedList, /1\/2 completed/);
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.match(archivedPage, /aria-label="Complete Done" checked disabled/);
    assert.match(archivedPage, /aria-label="Complete Pending" disabled/);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /Complete Pending/);
    assert.doesNotMatch(open, /Complete Done/);
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /Complete Done/);
    assert.doesNotMatch(completed, /Complete Pending/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 403);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal(await get('/?filter=Archived'), archivedList);
    await post('/projects/1/restore');
    assert.equal(rows(await get('/?filter=Archived')), 0);
    const restoredList = await get('/');
    assert.equal(rows(restoredList), 2);
    assert.ok(restoredList.indexOf('Existing') < restoredList.indexOf('New'));
    const restoredPage = await get('/projects/1');
    assert.doesNotMatch(restoredPage, /<(?:input|button)[^>]* disabled|Archived project/);
    assert.match(restoredPage, /aria-label="Complete Done" checked/);
    await post('/projects/1/tasks/2', { completed: '1' });
    assert.match(await get('/'), /2\/2 completed/);
    await stop();
    await start();
    assert.match(await get('/'), /2\/2 completed/);
    assert.equal(rows(await get('/?filter=Archived')), 0);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
