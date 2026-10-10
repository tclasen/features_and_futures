import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const port = await new Promise((resolvePort, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) resolvePort(match[1]);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited ${code}: ${errors}`)));
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

test('projects validate, trim, keep order, navigate, and survive server restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const dbPath = resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = path => fetch(server.url + path);
    const create = name => fetch(server.url + '/projects', {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    for (const blank of ['', '  \t\n ']) {
      const response = await create(blank);
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second project', '<script>alert("hello")</script> 🧩']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const list = await (await get('/')).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 3);
    assert.match(list, />First project<\/span>/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second project'));
    assert.match(list, /&lt;script&gt;alert\(&quot;hello&quot;\)&lt;\/script&gt; 🧩/);
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 3);
    const detail = await (await get(paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await get('/projects/99999')).status, 404);
    assert.equal(await (await get('/')).text(), list);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await get('/')).text(), list);
    assert.equal(await (await get(paths[0])).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, stay project-owned, and persist completion across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-tasks-');
  const dbPath = resolve(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, fields) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const initial = await get('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /value="all" selected>All/);
    assert.match(initial, /value="open">Open/);
    assert.match(initial, /value="completed">Completed/);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.doesNotMatch(body, /data-testid="task-row"/);
    }
    for (const title of ['  Write proposal  ', 'Review <draft>']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    const all = await get('/projects/1');
    assert.equal((all.match(/data-testid="task-row"/g) || []).length, 2);
    assert.match(all, /<span>Write proposal<\/span>/);
    assert.match(all, /aria-label="Complete Write proposal"/);
    assert.match(all, /aria-label="Complete Review &lt;draft&gt;"/);
    assert.doesNotMatch(all, / checked/);
    assert.ok(all.indexOf('<span>Write proposal') < all.indexOf('<span>Review'));
    assert.doesNotMatch(all, /Other project task/);
    assert.doesNotMatch(await get('/projects/2'), /Write proposal|Review &lt;draft&gt;/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 303);
    const completed = await get('/projects/1?filter=completed');
    assert.match(completed, /aria-label="Complete Write proposal" checked/);
    assert.doesNotMatch(completed, /<span>Review/);
    const open = await get('/projects/1?filter=open');
    assert.doesNotMatch(open, /<span>Write proposal/);
    assert.match(open, /<span>Review &lt;draft&gt;<\/span>/);
    const saved = await get('/projects/1');
    assert.equal((saved.match(/data-testid="task-row"/g) || []).length, 2);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/projects/1?filter=completed'), completed);
    assert.equal(await get('/projects/1?filter=open'), open);
    const unchecked = await post('/projects/1/tasks/1', { filter: 'completed' });
    assert.equal(unchecked.headers.get('location'), '/projects/1?filter=completed');
    assert.doesNotMatch(await get('/projects/1?filter=completed'), /data-testid="task-row"/);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await get('/projects/1'), / checked/);
    assert.equal((await get('/projects/1?filter=open')).match(/data-testid="task-row"/g).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
