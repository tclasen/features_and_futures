import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
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

test('projects validate, render safely, navigate, and persist across restarts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let app;
  t.after(async () => {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  });
  app = await start(dbPath);
  const get = (path) => fetch(app.base + path);
  const create = (name) => fetch(app.base + '/projects', {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
  let response = await get('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  let body = await (await get('/')).text();
  assert.match(body, /<h1>Workboard<\/h1>/);
  assert.match(body, /<label for="project-name">Project name<\/label>/);
  assert.match(body, />Create project<\/button>/);
  assert.doesNotMatch(body, /data-testid="project-row"/);
  for (const name of ['', ' \t\n ']) {
    response = await create(name);
    assert.equal(response.status, 422);
    body = await response.text();
    assert.match(body, /role="alert">Project name is required/);
    assert.doesNotMatch(body, /data-testid="project-row"/);
  }
  for (const name of ['  First project  ', '<script>alert("x")</script>']) {
    response = await create(name);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
  }
  body = await (await get('/')).text();
  assert.equal((body.match(/data-testid="project-row"/g) || []).length, 2);
  assert.match(body, /<span>First project<\/span>/);
  assert.match(body, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.ok(body.indexOf('First project') < body.indexOf('&lt;script&gt;'));
  const paths = [...body.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
  assert.equal(paths.length, 2);
  assert.notEqual(paths[0], paths[1]);
  const detail = await (await get(paths[0])).text();
  assert.match(detail, /<h1>First project<\/h1>/);
  assert.match(detail, /action="\/"/);
  assert.match(detail, />Projects<\/button>/);
  assert.equal((await get('/projects/99999')).status, 404);
  assert.equal((await get('/missing')).status, 404);
  await app.stop();
  app = undefined;
  app = await start(dbPath);
  assert.equal(await (await get('/')).text(), body);
  assert.equal(await (await get(paths[0])).text(), detail);
  await create('Third');
  const updated = await (await get('/')).text();
  assert.equal((updated.match(/data-testid="project-row"/g) || []).length, 3);
  assert.ok(updated.indexOf('Third') > updated.indexOf('&lt;script&gt;'));
});

test('tasks validate, filter, remain project-owned, and persist completion', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let app;
  t.after(async () => {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  });
  app = await start(dbPath);
  const get = async (path) => (await fetch(app.base + path)).text();
  const post = (path, values) => fetch(app.base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const countRows = (body) => (body.match(/data-testid="task-row"/g) || []).length;
  await post('/projects', { name: 'First' });
  await post('/projects', { name: 'Second' });
  const project = '/projects/1';
  let body = await get(project);
  assert.match(body, /<label for="task-title">Task title<\/label>/);
  assert.match(body, />Create task<\/button>/);
  assert.match(body, /<label for="task-filter">Task filter<\/label>/);
  assert.match(body, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
  for (const title of ['', ' \t\n ']) {
    const response = await post(project + '/tasks', { title });
    assert.equal(response.status, 422);
    body = await response.text();
    assert.match(body, /role="alert">Task title is required/);
    assert.equal(countRows(body), 0);
  }
  for (const title of ['  First task  ', '<draft> & "review"']) {
    const response = await post(project + '/tasks', { title });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), project);
  }
  body = await get(project);
  assert.equal(countRows(body), 2);
  assert.match(body, /aria-label="Complete First task"/);
  assert.match(body, /<span>First task<\/span>/);
  assert.match(body, /Complete &lt;draft&gt; &amp; &quot;review&quot;/);
  assert.doesNotMatch(body, / checked/);
  assert.ok(body.indexOf('First task') < body.indexOf('&lt;draft&gt;'));
  assert.equal(countRows(await get('/projects/2')), 0);
  assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
  assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
  assert.equal((await post(project + '/tasks/999', { completed: '1' })).status, 404);
  let response = await post(project + '/tasks/1', { completed: '1', filter: 'Open' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), project + '?filter=Open');
  body = await get(project);
  assert.match(body, /aria-label="Complete First task" checked/);
  const open = await get(project + '?filter=Open');
  const completed = await get(project + '?filter=Completed');
  assert.equal(countRows(open), 1);
  assert.doesNotMatch(open, /<span>First task<\/span>/);
  assert.equal(countRows(completed), 1);
  assert.match(completed, /<span>First task<\/span>/);
  assert.match(completed, /<option selected>Completed<\/option>/);
  assert.equal(countRows(await get(project + '?filter=invalid')), 2);
  await app.stop();
  app = undefined;
  app = await start(dbPath);
  assert.equal(await get(project), body);
  assert.equal(await get(project + '?filter=Open'), open);
  assert.equal(await get(project + '?filter=Completed'), completed);
  response = await post(project + '/tasks/1', {});
  assert.equal(response.status, 303);
  assert.doesNotMatch(await get(project), / checked/);
  assert.equal(countRows(await get(project + '?filter=Open')), 2);
  assert.equal(countRows(await get(project + '?filter=Completed')), 0);
  await post('/projects/2/tasks', { title: 'Other project task' });
  assert.equal(countRows(await get('/projects/2')), 1);
  assert.doesNotMatch(await get(project), /Other project task/);
  await app.stop();
  app = undefined;
  app = await start(dbPath);
  assert.doesNotMatch(await get(project), / checked/);
  assert.equal(countRows(await get('/projects/2')), 1);
});
