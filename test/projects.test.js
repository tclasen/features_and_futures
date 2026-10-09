import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}\n${output}`)));
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
  });
  return {
    url,
    async stop() {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    },
  };
}

test('projects validate, render safely, navigate, and survive restart', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t  ']) {
      const response = await create(name);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second <project>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    html = await (await fetch(server.url)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.match(html, /<span>Second &lt;project&gt;<\/span>/);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/9999`)).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.url)).text(), html);
    assert.equal(await (await fetch(`${server.url}${paths[0]}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain scoped, and persist completion', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(directory, 'tasks.sqlite');
    server = await start(dbPath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const detail = (id, filter = 'All') => fetch(`${server.url}/projects/${id}?filter=${filter}`).then(r => r.text());
    const rows = html => [...html.matchAll(/data-testid="task-row"[\s\S]*?<\/form>/g)].map(match => match[0]);
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await detail(1);
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '  \t ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Task title is required/);
      assert.equal(rows(await detail(1)).length, 0);
    }
    await post('/projects/1/tasks', { title: '  First task  ' });
    await post('/projects/1/tasks', { title: 'Next <task>' });
    await post('/projects/2/tasks', { title: 'Other task' });
    html = await detail(1);
    assert.equal(rows(html).length, 2);
    assert.match(rows(html)[0], /aria-label="Complete First task"/);
    assert.doesNotMatch(rows(html)[0], / checked/);
    assert.match(rows(html)[1], /Next &lt;task&gt;/);
    assert.doesNotMatch(html, /Other task/);
    assert.equal(rows(await detail(1, 'Completed')).length, 0);
    assert.equal(rows(await detail(1, 'Open')).length, 2);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    const update = await post('/projects/1/tasks/1', { completed: '1', filter: 'Open' });
    assert.equal(update.headers.get('location'), '/projects/1?filter=Open');
    assert.match(rows(await detail(1))[0], / checked/);
    assert.equal(rows(await detail(1, 'Open')).length, 1);
    assert.match(rows(await detail(1, 'Completed'))[0], /First task/);
    const saved = await detail(1);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail(1), saved);
    assert.match(await detail(2), /Other task/);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(rows(await detail(1))[0], / checked/);
    assert.equal(rows(await detail(1, 'Completed')).length, 0);
    assert.equal(rows(await detail(1, 'Open')).length, 2);

    // Exercise the actual page script: checkbox saves must not navigate, and
    // filter navigation must wait until the database update has finished.
    const script = (await detail(1)).match(/<script>([\s\S]*?)<\/script>/)[1];
    const alert = { hidden: true };
    let release;
    let gate;
    const requests = [];
    const context = {
      URLSearchParams,
      FormData: class {
        constructor() {
          return [['filter', 'All'], ...(input.checked ? [['completed', '1']] : [])];
        }
      },
      document: { getElementById: () => alert },
      fetch: async (url, options) => {
        requests.push(options);
        await gate;
        return fetch(url, options);
      },
    };
    const input = {
      checked: false, disabled: false,
      form: { action: `${server.url}/projects/1/tasks/1` },
    };
    runInNewContext(script, context);
    for (const completed of [true, false]) {
      input.checked = completed;
      gate = new Promise(resolve => { release = resolve; });
      const save = context.saveCompletion(input);
      assert.equal(input.disabled, true);
      let navigated = false;
      const navigation = context.submitTaskFilter({ requestSubmit() { navigated = true; } });
      await Promise.resolve();
      assert.equal(navigated, false);
      release();
      await save;
      await navigation;
      assert.equal(navigated, true);
      assert.equal(input.disabled, false);
      assert.equal(input.checked, completed);
      assert.equal(rows(await detail(1))[0].includes(' checked'), completed);
    }
    assert.equal(requests[0].body.get('completed'), '1');
    assert.equal(requests[1].body.has('completed'), false);
    assert.equal(alert.hidden, true);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(rows(await detail(1))[0], / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
