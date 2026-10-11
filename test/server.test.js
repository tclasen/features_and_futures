import { test } from 'node:test';
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
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

async function post(baseUrl, path, values) {
  return fetch(baseUrl + path, {
    method: 'POST',
    body: new URLSearchParams(values),
    redirect: 'manual',
  });
}

async function create(baseUrl, name) {
  return fetch(`${baseUrl}/projects`, {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
}

test('project validation, creation order, navigation, escaping, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'workboard.sqlite');
    server = await startServer(databasePath);
    const { baseUrl } = server;
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(baseUrl)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const name of ['', ' \t\n ']) {
      const response = await create(baseUrl, name);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<Second & "project">']) {
      const response = await create(baseUrl, name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const listing = await (await fetch(baseUrl)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span>First project<\/span>/);
    assert.match(listing, /&lt;Second &amp; &quot;project&quot;&gt;/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;Second'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const detail = await (await fetch(baseUrl + paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${baseUrl}/projects/99999`)).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.baseUrl)).text(), listing);
    assert.equal(await (await fetch(server.baseUrl + paths[0])).text(), detail);
    await create(server.baseUrl, 'Third');
    const finalListing = await (await fetch(server.baseUrl)).text();
    assert.equal((finalListing.match(/data-testid="project-row"/g) || []).length, 3);
    assert.ok(finalListing.indexOf('Third') > finalListing.indexOf('&lt;Second'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain project-owned, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    await create(server.baseUrl, 'One');
    await create(server.baseUrl, 'Two');
    const detail = async (path = '/projects/1') => (await fetch(server.baseUrl + path)).text();
    const rows = html => (html.match(/data-testid="task-row"/g) || []).length;
    let html = await detail();
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const response = await post(server.baseUrl, '/projects/1/tasks', { title });
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html), 0);
    }
    for (const title of ['  First task  ', '<Second & "task">']) {
      assert.equal((await post(server.baseUrl, '/projects/1/tasks', { title })).status, 303);
    }
    html = await detail();
    assert.equal(rows(html), 2);
    assert.match(html, /<span>First task<\/span>/);
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /aria-label="Complete &lt;Second &amp; &quot;task&quot;&gt;"/);
    assert.doesNotMatch(html, / checked/);
    assert.ok(html.indexOf('<span>First task') < html.indexOf('<span>&lt;Second'));
    assert.equal(rows(await detail('/projects/2')), 0);
    assert.equal(rows(await detail('/projects/1?filter=Completed')), 0);
    assert.equal(rows(await detail('/projects/1?filter=Open')), 2);

    assert.equal((await post(server.baseUrl, '/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post(server.baseUrl, '/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post(server.baseUrl, '/projects/1/tasks/999', { completed: '1' })).status, 404);
    const completed = await post(server.baseUrl, '/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    html = await detail('/projects/1?filter=Completed');
    assert.equal(rows(html), 1);
    assert.match(html, /aria-label="Complete First task" checked/);
    assert.equal(rows(await detail('/projects/1?filter=Open')), 1);
    const saved = await detail();
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await detail(), saved);
    assert.equal(rows(await detail('/projects/2')), 0);
    await post(server.baseUrl, '/projects/1/tasks/1', {});
    assert.equal(rows(await detail('/projects/1?filter=Completed')), 0);
    assert.equal(rows(await detail('/projects/1?filter=Open')), 2);
    assert.doesNotMatch(await detail(), / checked/);
    assert.match(await detail('/projects/1?filter=invalid'), /<option selected>All/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
