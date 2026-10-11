import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function launch(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (data) => { errors += data; });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited ${code}: ${errors}`)));
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

test('archive, summaries, restore, and migration persist without task loss', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/archive-test-');
  const databasePath = path.resolve(directory, 'projects.sqlite');
  const oldDb = new DatabaseSync(databasePath);
  oldDb.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL); INSERT INTO projects (name) VALUES ('Existing');");
  oldDb.close();
  let server;
  try {
    server = await launch(databasePath);
    const post = (route, values = {}) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (route) => (await fetch(server.url + route)).text();
    assert.match(await html('/'), /<option selected>Active<\/option>/);
    assert.match(await html('/'), /data-testid="project-summary">0\/0 completed/);
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'First task' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/1/tasks/1', { completed: '1' });
    assert.match(await html('/'), /data-testid="project-summary">1\/2 completed/);
    await post('/projects/1/archive');
    assert.ok(!(await html('/')).includes('<span>Existing</span>'));
    const archivedList = await html('/?filter=Archived');
    assert.match(archivedList, /Restore project/);
    assert.match(archivedList, /1\/2 completed/);
    const archivedPage = await html('/projects/1');
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled/g) || []).length, 2);
    const completed = await html('/projects/1?filter=Completed');
    assert.ok(completed.includes('First task'));
    assert.ok(!completed.includes('Second task'));
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 403);
    assert.equal((await post('/projects/1/tasks/1')).status, 403);
    await server.stop();
    server = await launch(databasePath);
    assert.equal(await html('/?filter=Archived'), archivedList);
    assert.equal(await html('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.ok(!(await html('/?filter=Archived')).includes('data-testid="project-row"'));
    const active = await html('/');
    assert.ok(active.indexOf('<span>Existing</span>') < active.indexOf('<span>Second</span>'));
    assert.match(active, /1\/2 completed/);
    assert.ok(!(await html('/projects/1')).includes(' disabled'));
    await post('/projects/1/tasks/1');
    assert.match(await html('/'), /0\/2 completed/);
    await server.stop();
    server = await launch(databasePath);
    assert.match(await html('/'), /0\/2 completed/);
    assert.ok(!(await html('/projects/1')).includes('Archived project'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay project-scoped, and persist completion', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/tasks-test-');
  const databasePath = path.resolve(directory, 'tasks.sqlite');
  let server;
  try {
    server = await launch(databasePath);
    const post = (route, values) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (route) => (await fetch(server.url + route)).text();
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    const initial = await html('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /<option selected>All<\/option>/);
    for (const title of ['', '  ']) {
      const invalid = await (await post('/projects/1/tasks', { title })).text();
      assert.match(invalid, /role="alert">Task title is required/);
      assert.ok(!invalid.includes('data-testid="task-row"'));
    }
    await post('/projects/1/tasks', { title: '  First <task>  ' });
    await post('/projects/1/tasks', { title: 'Second task' });
    await post('/projects/2/tasks', { title: 'Other task' });
    const all = await html('/projects/1');
    assert.equal((all.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(all.indexOf('First &lt;task&gt;') < all.indexOf('Second task'));
    assert.match(all, /aria-label="Complete First &lt;task&gt;"/);
    assert.ok(!all.includes(' checked'));
    assert.ok(!all.includes('Other task'));
    assert.ok(!(await html('/projects/2')).includes('Second task'));
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    const completed = await html('/projects/1?filter=Completed');
    assert.match(completed, /aria-label="Complete First &lt;task&gt;" checked/);
    assert.ok(!completed.includes('Second task'));
    const open = await html('/projects/1?filter=Open');
    assert.ok(!open.includes('First &lt;task&gt;'));
    assert.ok(open.includes('Second task'));
    await server.stop();
    server = await launch(databasePath);
    assert.equal(await html('/projects/1?filter=Completed'), completed);
    assert.equal(await html('/projects/1?filter=Open'), open);
    await post('/projects/1/tasks/1', {});
    assert.ok(!(await html('/projects/1?filter=Completed')).includes('data-testid="task-row"'));
    assert.equal((await html('/projects/1?filter=Open')).match(/data-testid="task-row"/g).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, trim, preserve order, navigate, and survive a restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = path.resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await launch(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    for (const blank of ['', '   ']) {
      const response = await create(blank);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
    assert.match(list, /<span>First project<\/span>/);
    const projectPaths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(projectPaths.length, 2);
    const detail = await (await fetch(server.url + projectPaths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/"[^>]*><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/9999`)).status, 404);
    await server.stop();
    server = await launch(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(server.url + projectPaths[0])).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
