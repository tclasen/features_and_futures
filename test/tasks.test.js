import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

const rows = html => html.match(/<li data-testid="task-row">[\s\S]*?<\/li>/g) || [];

test('tasks validate, filter, remain project-scoped, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const post = (path, body) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(body), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    html = await (await post('/projects/1/tasks', { title: ' \t ' })).text();
    assert.match(html, /role="alert">Task title is required/);
    assert.equal(rows(html).length, 0);
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: '<Second task>' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    html = await get('/projects/1');
    const initialRows = rows(html);
    assert.equal(initialRows.length, 2);
    assert.match(initialRows[0], /<span>First task<\/span>/);
    assert.match(initialRows[0], /aria-label="Complete First task"/);
    assert.doesNotMatch(html, / checked/);
    assert.match(initialRows[1], /&lt;Second task&gt;/);
    assert.doesNotMatch(html, /Other project task/);
    assert.equal(rows(await get('/projects/2')).length, 1);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 303);
    assert.match(rows(await get('/projects/1'))[0], / checked/);
    const open = await get('/projects/1?filter=Open');
    assert.equal(rows(open).length, 1);
    assert.match(rows(open)[0], /&lt;Second task&gt;/);
    const completed = await get('/projects/1?filter=Completed');
    assert.equal(rows(completed).length, 1);
    assert.match(rows(completed)[0], /First task/);
    const all = await get('/projects/1');
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), all);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    await post('/projects/1/tasks/1', {});
    assert.equal(rows(await get('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await get('/projects/1?filter=Completed')).length, 0);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.doesNotMatch(await get('/projects/1'), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
