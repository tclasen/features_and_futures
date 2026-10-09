import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    base,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    let document = await (await fetch(server.base)).text();
    assert.match(document, /<h1>Workboard<\/h1>/);
    assert.match(document, /<label for="project-name">Project name<\/label>/);
    assert.match(document, /<button type="submit">Create project<\/button>/);
    assert.equal(document.includes('data-testid="project-row"'), false);

    const create = name => fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      document = await response.text();
      assert.match(document, /role="alert">Project name is required/);
      assert.equal(document.includes('data-testid="project-row"'), false);
    }
    for (const name of ['  First project  ', 'Second <project> & "friends"']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    document = await (await fetch(server.base)).text();
    assert.equal((document.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(document, />First project<\/span>/);
    assert.match(document, /Second &lt;project&gt; &amp; &quot;friends&quot;/);
    assert.ok(document.indexOf('First project') < document.indexOf('Second &lt;project&gt;'));
    const paths = [...document.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.base}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/99999`)).status, 404);

    await server.stop();
    server = await start(dbPath);
    const persisted = await (await fetch(server.base)).text();
    assert.equal(persisted, document);
    const persistedDetail = await (await fetch(`${server.base}${paths[0]}`)).text();
    assert.equal(persistedDetail, detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay in their project, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'tasks.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const post = (path, values) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    for (const name of ['First', 'Second']) await post('/projects', { name });
    let document = await get('/projects/1');
    assert.match(document, /<label for="task-title">Task title<\/label>/);
    assert.match(document, /<button type="submit">Create task<\/button>/);
    assert.match(document, /<label for="task-filter">Task filter<\/label>/);
    assert.match(document, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      document = await response.text();
      assert.match(document, /role="alert">Task title is required/);
      assert.equal(document.includes('data-testid="task-row"'), false);
    }
    for (const title of ['  First task  ', 'Second <task> & "friends"']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    document = await get('/projects/1');
    assert.equal((document.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(document, /aria-label="Complete First task"/);
    assert.match(document, /aria-label="Complete Second &lt;task&gt; &amp; &quot;friends&quot;"/);
    assert.ok(document.indexOf('Complete First task') < document.indexOf('Complete Second'));
    assert.equal(document.includes(' checked'), false);
    assert.equal(document.includes('Other project task'), false);
    assert.equal((await get('/projects/2')).includes('First task'), false);

    const completed = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    document = await get('/projects/1');
    assert.match(document, /aria-label="Complete First task" checked/);
    const open = await get('/projects/1?filter=Open');
    assert.equal(open.includes('First task'), false);
    assert.equal((open.match(/data-testid="task-row"/g) || []).length, 1);
    const done = await get('/projects/1?filter=Completed');
    assert.match(done, /Complete First task/);
    assert.equal(done.includes('Complete Second'), false);
    assert.equal((await post('/projects/2/tasks/1', { completed: '0' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing project' })).status, 404);

    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), document);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), done);
    assert.match(await get('/projects/2'), /Other project task/);
    assert.equal((await post('/projects/1/tasks/1', {})).status, 303);
    assert.equal((await get('/projects/1')).includes(' checked'), false);
    assert.equal((await get('/projects/1?filter=Completed')).includes('data-testid="task-row"'), false);
    await server.stop();
    server = await start(dbPath);
    assert.equal((await get('/projects/1')).includes(' checked'), false);
    assert.equal(((await get('/projects/1?filter=Open')).match(/data-testid="task-row"/g) || []).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
