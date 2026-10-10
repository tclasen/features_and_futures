import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const base = await new Promise((resolveBase, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited ${code}: ${output}`)));
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolveBase(`http://127.0.0.1:${match[1]}`);
    });
  });
  return { base, async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } };
}

test('project validation, creation order, navigation, and restart persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'projects.sqlite');
    server = await start(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    for (const name of ['', '   ']) {
      const response = await fetch(`${server.base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }),
      });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  Alpha & <team>  ', 'Beta']) {
      const response = await fetch(`${server.base}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const list = await (await fetch(server.base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('Alpha &amp; &lt;team&gt;') < list.indexOf('Beta'));
    assert.match(list, /action="\/projects\/1"/);
    assert.match(list, /action="\/projects\/2"/);
    const detail = await (await fetch(`${server.base}/projects/1`)).text();
    assert.match(detail, /<h1>Alpha &amp; &lt;team&gt;<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/999`)).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.base)).text(), list);
    assert.equal(await (await fetch(`${server.base}/projects/1`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task validation, ordering, filters, ownership, completion, and restart persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const dbPath = resolve(directory, 'tasks.sqlite');
    server = await start(dbPath);
    const post = (path, fields) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const detail = async (id, filter = 'All') => (await fetch(`${server.base}/projects/${id}?filter=${filter}`)).text();
    const rows = html => [...html.matchAll(/data-testid="task-row"/g)].length;
    for (const name of ['Alpha', 'Beta']) assert.equal((await post('/projects', { name })).status, 303);
    const empty = await detail(1);
    assert.match(empty, /<label for="task-title">Task title<\/label>/);
    assert.match(empty, />Create task<\/button>/);
    assert.match(empty, /<label for="task-filter">Task filter<\/label>/);
    assert.match(empty, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html), 0);
    }
    for (const title of ['  First & <task> "quoted"  ', 'Second']) {
      assert.equal((await post('/projects/1/tasks', { title })).status, 303);
    }
    const all = await detail(1);
    assert.equal(rows(all), 2);
    assert.ok(all.indexOf('Complete First') < all.indexOf('Complete Second'));
    assert.match(all, /aria-label="Complete First &amp; &lt;task&gt; &quot;quoted&quot;"/);
    assert.doesNotMatch(all, / checked/);
    assert.equal(rows(await detail(1, 'Open')), 2);
    assert.equal(rows(await detail(1, 'Completed')), 0);
    assert.equal(rows(await detail(2)), 0);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    const completed = await post('/projects/1/tasks/1/completion', { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const saved = await detail(1);
    assert.match(saved, /aria-label="Complete First[^\n]* checked/);
    assert.equal(rows(await detail(1, 'Open')), 1);
    const completedList = await detail(1, 'Completed');
    assert.equal(rows(completedList), 1);
    assert.match(completedList, /Complete First/);
    assert.doesNotMatch(completedList, /Complete Second/);
    assert.equal(rows(await detail(1, 'invalid')), 2);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail(1), saved);
    assert.equal(await detail(1, 'Completed'), completedList);
    assert.equal(rows(await detail(2)), 0);
    assert.equal((await post('/projects/1/tasks/1/completion', {})).status, 303);
    assert.equal(rows(await detail(1, 'Completed')), 0);
    assert.equal(rows(await detail(1, 'Open')), 2);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await detail(1), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
