import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 10000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
  return {
    base: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render safely in order, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initialPage = await (await fetch(server.base)).text();
    assert.match(initialPage, /<h1>Workboard<\/h1>/);
    assert.match(initialPage, /<label for="project-name">Project name<\/label>/);
    assert.match(initialPage, /<button type="submit">Create project<\/button>/);
    assert.doesNotMatch(initialPage, /data-testid="project-row"/);

    const create = name => fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second <script> & project']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const listing = await (await fetch(server.base)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span class="project-name">First project<\/span>/);
    assert.match(listing, /Second &lt;script&gt; &amp; project/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;script&gt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.base}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/99999`)).status, 404);

    const invalidAfterCreation = await (await create('   ')).text();
    assert.equal((invalidAfterCreation.match(/data-testid="project-row"/g) || []).length, 2);
    assert.equal(await (await fetch(server.base)).text(), listing);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.base)).text(), listing);
    assert.equal(await (await fetch(`${server.base}${paths[0]}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, toggle, stay within their project, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, fields) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.base}${path}`)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /<button type="submit">Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert">Task title is required/);
      assert.equal(await get('/projects/1'), initial);
    }
    for (const title of ['  Plan <launch> & "review"  ', 'Build']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    const listing = await get('/projects/1');
    assert.equal((listing.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(listing, /aria-label="Complete Plan &lt;launch&gt; &amp; &quot;review&quot;"/);
    assert.match(listing, /<span>Plan &lt;launch&gt; &amp; &quot;review&quot;<\/span>/);
    assert.ok(listing.indexOf('<span>Plan') < listing.indexOf('<span>Build'));
    assert.doesNotMatch(listing, / checked/);
    assert.doesNotMatch(listing, /Other project task/);
    const otherProject = await get('/projects/2');
    assert.match(otherProject, /Other project task/);
    assert.doesNotMatch(otherProject, /<span>Build/);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal(await get('/projects/1'), listing);
    const complete = await post('/projects/1/tasks/1/completion', { completed: '1', filter: 'Open' });
    assert.equal(complete.status, 303);
    assert.equal(complete.headers.get('location'), '/projects/1?filter=Open');
    const all = await get('/projects/1');
    assert.match(all, /aria-label="Complete Plan[^\n]+ checked/);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /<option selected>Open<\/option>/);
    assert.match(open, /<span>Build<\/span>/);
    assert.doesNotMatch(open, /<span>Plan/);
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /<option selected>Completed<\/option>/);
    assert.match(completed, /<span>Plan/);
    assert.doesNotMatch(completed, /<span>Build/);
    assert.equal(await get('/projects/1?filter=unknown'), all);
    const invalid = await post('/projects/1/tasks', { title: '   ', filter: 'Completed' });
    assert.equal(invalid.status, 422);
    assert.match(await invalid.text(), /role="alert">Task title is required/);
    assert.equal(await get('/projects/1'), all);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), all);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(await get('/projects/2'), otherProject);
    const uncomplete = await post('/projects/1/tasks/1/completion', { filter: 'Completed' });
    assert.equal(uncomplete.status, 303);
    assert.equal(uncomplete.headers.get('location'), '/projects/1?filter=Completed');
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal(await get('/projects/1'), listing);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/projects/1'), listing);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
