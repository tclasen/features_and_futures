import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    base,
    stop: () => new Promise(resolve => {
      child.once('exit', resolve);
      child.kill('SIGTERM');
    }),
  };
}

const rows = (html, type = 'project') => html.match(new RegExp(`<li data-testid="${type}-row">[\\s\\S]*?<\\/li>`, 'g')) || [];

test('archive and restore preserve tasks, summaries, filtering, and persisted state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    // Exercise migration from the original project schema with existing data.
    const db = new DatabaseSync(databasePath);
    db.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL); INSERT INTO projects (name) VALUES ('Existing');");
    db.close();
    server = await start(databasePath);
    const post = (path, body = {}) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(body), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    let html = await get('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(rows(html)[0], /data-testid="project-summary">0\/0 completed/);
    assert.match(rows(html)[0], />Archive project<\/button>/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(rows(await get('/'))[0], /1\/2 completed/);
    assert.equal((await post('/projects/1/archive')).status, 303);
    assert.equal(rows(await get('/')).length, 1);
    assert.match(rows(await get('/'))[0], /Second/);
    html = await get('/?filter=Archived');
    assert.equal(rows(html).length, 1);
    assert.match(rows(html)[0], /Existing/);
    assert.match(rows(html)[0], /1\/2 completed/);
    assert.match(rows(html)[0], />Open project<\/button>/);
    assert.match(rows(html)[0], />Restore project<\/button>/);
    assert.doesNotMatch(rows(html)[0], />Archive project<\/button>/);
    const archivedList = html;
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    for (const row of rows(archivedPage, 'task')) assert.match(row, /disabled/);
    assert.equal(rows(await get('/projects/1?filter=Open'), 'task').length, 1);
    assert.match(rows(await get('/projects/1?filter=Completed'), 'task')[0], /Done/);
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    assert.equal(await get('/projects/1'), archivedPage);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal((await post('/projects/1/restore')).status, 303);
    assert.equal(rows(await get('/?filter=Archived')).length, 0);
    html = await get('/');
    assert.equal(rows(html).length, 2);
    assert.match(rows(html)[0], /Existing/);
    assert.match(rows(html)[0], /1\/2 completed/);
    const restoredPage = await get('/projects/1');
    assert.doesNotMatch(restoredPage, /disabled|Archived project/);
    assert.match(rows(restoredPage, 'task')[0], /checked/);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal(await get('/'), html);
    await post('/projects/1/tasks/1');
    assert.match(rows(await get('/'))[0], /0\/2 completed/);
    assert.equal((await post('/projects/999/archive')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
