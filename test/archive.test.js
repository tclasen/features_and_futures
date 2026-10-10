import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createApplication } from '../app.js';

test('archive migration, summaries, read-only tasks, restoration and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Model a database created by the previous checkpoint.
  const database = new DatabaseSync(databasePath);
  database.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Existing');`);
  database.close();
  let server;
  let url;
  async function start() {
    server = createApplication(databasePath);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() {
    const closed = once(server, 'close');
    server.close();
    await closed;
    server = undefined;
  }
  const get = async path => (await fetch(url + path)).text();
  const post = (path, values = {}) => fetch(url + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const rows = html => [...html.matchAll(/data-testid="project-row"[\s\S]*?<\/div>/g)].map(match => match[0]);
  try {
    await start();
    let html = await get('/');
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(html, /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    html = await get('/');
    assert.equal(rows(html).length, 2);
    assert.match(rows(html)[0], /Existing[\s\S]*1\/2 completed/);
    assert.match(rows(html)[1], /Second[\s\S]*0\/0 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(rows(await get('/')).length, 1);
    html = await get('/?filter=Archived');
    assert.equal(rows(html).length, 1);
    assert.match(html, /Existing/);
    assert.match(html, /1\/2 completed/);
    assert.match(html, />Open project<\/button>/);
    assert.match(html, />Restore project<\/button>/);
    assert.doesNotMatch(html, />Archive project<\/button>/);
    html = await get('/projects/1');
    assert.match(html, /Archived project/);
    assert.match(html, /<button type="submit" disabled>Create task/);
    const checkboxes = html.match(/<input id="task-\d+"[\s\S]*?>/g);
    assert.equal(checkboxes.length, 2);
    assert.ok(checkboxes.every(checkbox => checkbox.includes('disabled')));
    assert.match(checkboxes[0], /checked/);
    assert.equal(((await get('/projects/1?filter=Completed')).match(/data-testid="task-row"/g) ?? []).length, 1);
    assert.equal(((await get('/projects/1?filter=Open')).match(/data-testid="task-row"/g) ?? []).length, 1);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    await stop();
    await start();
    assert.equal(await get('/projects/1'), html);
    assert.match(await get('/?filter=Archived'), /1\/2 completed/);
    await post('/projects/1/restore');
    html = await get('/projects/1');
    assert.doesNotMatch(html, /Archived project|<(?:input|button)\b[^>]*\bdisabled/);
    assert.match(html, /checked/);
    assert.equal(rows(await get('/?filter=Archived')).length, 0);
    assert.match(rows(await get('/'))[0], /Existing[\s\S]*1\/2 completed/);
    await post('/projects/1/tasks/2', { completed: '1' });
    await stop();
    await start();
    assert.match(rows(await get('/'))[0], /2\/2 completed/);
    assert.equal((await post('/projects/999/archive')).status, 404);
    assert.equal((await post('/projects/999/restore')).status, 404);
  } finally {
    if (server) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
