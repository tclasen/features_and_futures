import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', (chunk) => { diagnostics += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${diagnostics}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${diagnostics}`));
    });
    child.stdout.on('data', (chunk) => {
      const match = /listening on port (\d+)/.exec(String(chunk));
      if (match) {
        clearTimeout(timeout);
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

test('project validation, order, navigation, escaping, and process restart persistence', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = (path) => fetch(`${running.baseUrl}${path}`);
    const create = (name) => fetch(`${running.baseUrl}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await get('/')).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    for (const name of ['', '  \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      html = await invalid.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<script>alert("hi")</script>']) {
      const created = await create(name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const beforeRestart = await (await get('/')).text();
    assert.equal((beforeRestart.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(beforeRestart, /<span>First project<\/span>/);
    assert.match(beforeRestart, /&lt;script&gt;alert\(&quot;hi&quot;\)&lt;\/script&gt;/);
    assert.ok(beforeRestart.indexOf('First project') < beforeRestart.indexOf('&lt;script&gt;'));
    const paths = [...beforeRestart.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    html = await (await get(paths[0])).text();
    assert.match(html, /<h1>First project<\/h1>/);
    assert.match(html, /action="\/"[^>]*><button type="submit">Projects<\/button>/);
    assert.equal((await get('/projects/999999')).status, 404);
    const invalid = await create('   ');
    assert.equal(( (await invalid.text()).match(/data-testid="project-row"/g) ?? []).length, 2);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await (await get('/')).text(), beforeRestart);
    assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks are validated, scoped, filtered, saved, and restored after process restart', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  let running;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    const rows = (value) => [...value.matchAll(/data-testid="task-row"/g)].length;
    assert.equal(rows(html), 0);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert"[^>]*>Task title is required/);
    }
    for (const title of ['  First task  ', 'Second <task> "quoted"']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    html = await get('/projects/1');
    assert.equal(rows(html), 2);
    assert.match(html, /<span>First task<\/span>/);
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /aria-label="Complete Second &lt;task&gt; &quot;quoted&quot;"/);
    assert.doesNotMatch(html, / checked/);
    assert.ok(html.indexOf('<span>First task') < html.indexOf('<span>Second'));
    assert.equal(rows(await get('/projects/2')), 0);
    // Ownership also applies to writes, not only rendering.
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: '1' })).status, 303);
    html = await get('/projects/1');
    assert.match(html, /aria-label="Complete First task" checked/);
    assert.equal(rows(html), 2);
    const open = await get('/projects/1?filter=Open');
    assert.equal(rows(open), 1);
    assert.doesNotMatch(open, /<span>First task/);
    assert.match(open, /<option selected>Open<\/option>/);
    const completed = await get('/projects/1?filter=Completed');
    assert.equal(rows(completed), 1);
    assert.match(completed, /<span>First task/);
    assert.doesNotMatch(completed, /<span>Second/);
    assert.equal(rows(await get('/projects/1?filter=unknown')), 2);
    const invalid = await post('/projects/1/tasks', { title: '  ', filter: 'Completed' });
    assert.equal(invalid.status, 400);
    assert.equal(rows(await invalid.text()), 1);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), html);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(rows(await get('/projects/2')), 0);
    const uncheck = await post('/projects/1/tasks/1/completion', { filter: 'Completed' });
    assert.equal(uncheck.status, 303);
    assert.equal(uncheck.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal(rows(await get('/projects/1?filter=Completed')), 0);
    assert.equal(rows(await get('/projects/1?filter=Open')), 2);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.doesNotMatch(await get('/projects/1'), / checked/);
    assert.equal(rows(await get('/projects/1?filter=Open')), 2);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
