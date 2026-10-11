import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}: ${errors}`)); });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('tasks validate, filter, stay isolated, and persist completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const paths = [...(await get('/')).matchAll(/action="(\/projects\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]);
    let html = await get(paths[0]);
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option>/);
    for (const title of ['', '  \t ']) {
      const response = await post(`${paths[0]}/tasks`, { title });
      assert.equal(response.status, 422);
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    assert.equal((await post(`${paths[0]}/tasks`, { title: '  First task  ' })).status, 303);
    await post(`${paths[0]}/tasks`, { title: '<b>Second</b>' });
    html = await get(paths[0]);
    assert.equal((html.match(/data-testid="task-row"/g) ?? []).length, 2);
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /<span>First task<\/span>/);
    assert.match(html, /<span>&lt;b&gt;Second&lt;\/b&gt;<\/span>/);
    assert.ok(html.indexOf('First task</span>') < html.indexOf('&lt;b&gt;Second'));
    assert.doesNotMatch(html, / checked/);
    const taskPaths = [...html.matchAll(/action="(\/projects\/[a-zA-Z0-9-]+\/tasks\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]);
    assert.equal((await post(taskPaths[0], { completed: '1' })).status, 303);
    const completed = await get(`${paths[0]}?filter=Completed`);
    assert.match(completed, /value="1" aria-label="Complete First task" checked/);
    assert.doesNotMatch(completed, /&lt;b&gt;Second/);
    const open = await get(`${paths[0]}?filter=Open`);
    assert.doesNotMatch(open, /First task/);
    assert.match(open, /&lt;b&gt;Second/);
    assert.doesNotMatch(await get(paths[1]), /data-testid="task-row"/);
    const wrongProject = taskPaths[0].replace(paths[0], paths[1]);
    assert.equal((await post(wrongProject, { completed: '0' })).status, 404);
    assert.equal((await post('/projects/missing/tasks', { title: 'Orphan' })).status, 404);
    const beforeRestart = await get(paths[0]);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get(paths[0]), beforeRestart);
    assert.equal(await get(`${paths[0]}?filter=Completed`), completed);
    assert.equal((await post(taskPaths[0], {})).status, 303);
    assert.doesNotMatch(await get(paths[0]), / checked/);
    assert.doesNotMatch(await get(`${paths[0]}?filter=Completed`), /data-testid="task-row"/);
    assert.equal((await get(`${paths[0]}?filter=Open`)).match(/data-testid="task-row"/g).length, 2);
    assert.match(await get(`${paths[0]}?filter=invalid`), /<option selected>All<\/option>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('archive migration, summaries, read-only tasks, restoration, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-archive-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (
    position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL
  ); INSERT INTO projects (id, name) VALUES ('legacy', 'Existing project');`);
  legacy.close();
  let server;
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    let html = await get('/');
    assert.match(html, /<option selected>Active<\/option>/);
    assert.match(html, /data-testid="project-summary">0\/0 completed/);
    assert.match(html, />Archive project<\/button>/);
    await post('/projects/legacy/tasks', { title: 'Finished' });
    await post('/projects/legacy/tasks', { title: 'Pending' });
    const detail = await get('/projects/legacy');
    const taskPath = detail.match(/action="([^\"]+\/tasks\/[^\"]+)"/)[1];
    await post(taskPath, { completed: '1' });
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    await get('/projects/legacy?filter=Open');
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post('/projects/legacy/archive')).status, 303);
    assert.doesNotMatch(await get('/'), /data-testid="project-row"/);
    html = await get('/?filter=Archived');
    assert.match(html, /<option selected>Archived<\/option>/);
    assert.match(html, />Open project<\/button>/);
    assert.match(html, />Restore project<\/button>/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    const archivedDetail = await get('/projects/legacy');
    assert.match(archivedDetail, />Archived project<\/p>/);
    assert.match(archivedDetail, /<button type="submit" disabled>Create task/);
    assert.equal((archivedDetail.match(/type="checkbox"[^>]* disabled/g) ?? []).length, 2);
    assert.match(archivedDetail, /Complete Finished" checked disabled/);
    const open = await get('/projects/legacy?filter=Open');
    assert.doesNotMatch(open, /Finished/);
    assert.match(open, /Pending/);
    const completed = await get('/projects/legacy?filter=Completed');
    assert.match(completed, /Finished/);
    assert.doesNotMatch(completed, /Pending/);
    assert.equal((await post('/projects/legacy/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await post(taskPath, {})).status, 403);
    assert.equal(await get('/projects/legacy'), archivedDetail);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await get('/?filter=Archived'), html);
    assert.equal(await get('/projects/legacy'), archivedDetail);
    assert.equal((await post('/projects/legacy/restore')).status, 303);
    assert.doesNotMatch(await get('/?filter=Archived'), /data-testid="project-row"/);
    assert.match(await get('/'), /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await get('/projects/legacy'), / disabled/);
    await post(taskPath, {});
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
    await server.stop();
    server = await startServer(databasePath);
    assert.match(await get('/'), /data-testid="project-summary">0\/2 completed/);
    assert.doesNotMatch(await get('/projects/legacy'), / checked|Archived project/);
    assert.equal((await post('/projects/missing/archive')).status, 404);
    assert.equal((await post('/projects/missing/restore')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project creation, navigation, escaping, and persistence across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    let html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);

    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '   \t ']) {
      const response = await create(name);
      assert.equal(response.status, 422);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('<script>alert("x")</script>')).status, 303);
    html = await (await fetch(server.url)).text();
    assert.equal((html.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.ok(html.indexOf('First project</span>') < html.indexOf('&lt;script&gt;'));
    assert.doesNotMatch(html, /<script>/);
    const paths = [...html.matchAll(/action="(\/projects\/[a-zA-Z0-9-]+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/missing`)).status, 404);

    const invalid = await create('   ');
    assert.equal((await invalid.text()).match(/data-testid="project-row"/g).length, 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.url)).text(), html);
    assert.equal(await (await fetch(`${server.url}${paths[0]}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
