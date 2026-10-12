import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server.js';

test('legacy projects migrate; archive, summaries and restoration persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const dbPath = join(directory, 'database.sqlite');
  // Represent the schema and data from the previous checkpoint.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Pending', 0);`);
  legacy.close();
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
  const html = async path => (await fetch(`${url}${path}`)).text();
  const rows = (text, kind) => [...text.matchAll(new RegExp(`<li[^>]*data-testid="${kind}-row"[^>]*>[\\s\\S]*?<\\/li>`, 'g'))].map(match => match[0]);
  try {
    await start();
    await post('/projects', { name: 'New' });
    let list = await html('/');
    assert.match(list, /<label for="project-filter">Project filter<\/label>/);
    assert.match(list, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(rows(list, 'project')[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(rows(list, 'project')[1], /data-testid="project-summary">0\/0 completed/);
    assert.match(rows(list, 'project')[0], />Archive project<\/button>/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(rows(await html('/'), 'project').length, 1);
    const archived = await html('/?filter=Archived');
    assert.equal(rows(archived, 'project').length, 1);
    assert.match(archived, />Open project<\/button>/);
    assert.match(archived, />Restore project<\/button>/);
    assert.match(archived, /1\/2 completed/);
    let detail = await html('/projects/1');
    assert.match(detail, /<p>Archived project<\/p>/);
    assert.match(detail, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(rows(detail, 'task').length, 2);
    for (const row of rows(detail, 'task')) assert.match(row, /type="checkbox"[^>]* disabled/);
    assert.equal(rows(await html('/projects/1?filter=Open'), 'task').length, 1);
    assert.match(rows(await html('/projects/1?filter=Completed'), 'task')[0], /Complete Done/);
    assert.equal((await post('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: '0' })).status, 403);
    assert.equal(await html('/projects/1'), detail);
    await stop();
    await start();
    assert.equal(await html('/?filter=Archived'), archived);
    assert.equal(await html('/projects/1'), detail);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(rows(await html('/?filter=Archived'), 'project').length, 0);
    list = await html('/');
    assert.match(rows(list, 'project')[0], /Existing/);
    assert.match(rows(list, 'project')[0], /1\/2 completed/);
    detail = await html('/projects/1');
    assert.doesNotMatch(detail, / disabled|Archived project/);
    assert.match(rows(detail, 'task')[0], / checked/);
    await post('/projects/1/tasks/2/completion', { completed: '1' });
    assert.match(rows(await html('/'), 'project')[0], /2\/2 completed/);
    await stop();
    await start();
    assert.match(rows(await html('/'), 'project')[0], /2\/2 completed/);
    assert.equal(rows(await html('/projects/1?filter=Completed'), 'task').length, 2);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
