import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const port = await new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Server startup timed out')); }, 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${errors}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolvePort(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise(resolveStop => {
      child.once('exit', resolveStop);
      child.kill('SIGTERM');
    }),
  };
}

test('tasks validate, filter, remain project-scoped, and persist completion across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, /Create task/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '  \t ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 422);
      html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Second <task> "quoted"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    html = await get('/projects/1');
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(html, /<span>First task<\/span>/);
    assert.match(html, /aria-label="Complete Second &lt;task&gt; &quot;quoted&quot;"/);
    assert.doesNotMatch(html, /\bchecked\b|Other project task/);
    assert.ok(html.indexOf('First task') < html.indexOf('Second &lt;task&gt;'));
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    html = await get('/projects/1?filter=Completed');
    assert.match(html, /First task/);
    assert.match(html, /\bchecked\b/);
    assert.doesNotMatch(html, /Second &lt;task&gt;/);
    assert.match(html, /<option selected>Completed<\/option>/);
    html = await get('/projects/1?filter=Open');
    assert.doesNotMatch(html, /First task/);
    assert.match(html, /Second &lt;task&gt;/);
    const allBefore = await get('/projects/1');
    await server.stop();
    server = await start(databasePath);
    assert.equal(await get('/projects/1'), allBefore);
    assert.match(await get('/projects/2'), /Other project task/);
    assert.doesNotMatch(await get('/projects/2'), /First task|Second &lt;task&gt;/);
    const unchecked = await post('/projects/1/tasks/1', { filter: 'Completed' });
    assert.equal(unchecked.headers.get('location'), '/projects/1?filter=Completed');
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal((await get('/projects/1?filter=Open')).match(/data-testid="task-row"/g).length, 2);
    await server.stop();
    server = await start(databasePath);
    assert.doesNotMatch(await get('/projects/1'), /\bchecked\b/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, trim, retain creation order, navigate, and persist across restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    let html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /Create project/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    for (const name of ['', '   \t ']) {
      const invalid = await create(name);
      html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    html = await (await fetch(server.url)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    const second = await (await fetch(`${server.url}${paths[1]}`)).text();
    assert.match(second, /<h1>Second &lt;project&gt;<\/h1>/);
    await server.stop();
    server = await start(databasePath);
    const persisted = await (await fetch(server.url)).text();
    assert.equal(persisted, html);
    assert.match(await (await fetch(`${server.url}${paths[0]}`)).text(), /<h1>First project<\/h1>/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
