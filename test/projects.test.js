import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';

async function start(dbPath) {
  const process = spawn(globalThis.process.execPath, ['server.js'], {
    env: { ...globalThis.process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
    process.once('error', reject);
    process.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited: ${code}`));
    });
    process.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    base,
    async stop() {
      const exited = once(process, 'exit');
      process.kill('SIGTERM');
      await exited;
    },
  };
}

test('tasks: validation, ordering, completion, filtering, isolation and persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, values) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const detail = async (path = '/projects/1') => (await fetch(`${server.base}${path}`)).text();
    const rows = (html) => html.match(/<div class="task-row"[\s\S]*?<\/div>/g) || [];
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    let html = await detail();
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', '  \t ']) {
      html = await (await post('/projects/1/tasks', { title })).text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    await post('/projects/1/tasks', { title: 'Second <task> & "test"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    html = await detail();
    assert.equal(rows(html).length, 2);
    assert.match(rows(html)[0], /aria-label="Complete First task"/);
    assert.doesNotMatch(rows(html).join(''), / checked/);
    assert.match(rows(html)[1], /Second &lt;task&gt; &amp; &quot;test&quot;/);
    assert.doesNotMatch(html, /Other project task/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    html = await detail();
    assert.match(rows(html)[0], / checked/);
    assert.doesNotMatch(rows(html)[1], / checked/);
    const open = await detail('/projects/1?filter=Open');
    assert.equal(rows(open).length, 1);
    assert.match(rows(open)[0], /Second &lt;task&gt;/);
    const completed = await detail('/projects/1?filter=Completed');
    assert.equal(rows(completed).length, 1);
    assert.match(rows(completed)[0], /First task/);
    assert.match(completed, /<option selected>Completed<\/option>/);
    const other = await detail('/projects/2');
    assert.equal(rows(other).length, 1);
    assert.match(other, /Other project task/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail(), html);
    assert.equal(await detail('/projects/1?filter=Completed'), completed);
    assert.equal(await detail('/projects/2'), other);
    await post('/projects/1/tasks/1', { filter: 'Completed' });
    assert.equal(rows(await detail('/projects/1?filter=Completed')).length, 0);
    assert.equal(rows(await detail('/projects/1?filter=Open')).length, 2);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing' })).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('completion client saves check/uncheck without stale-document navigation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-completion-'));
  let server;
  try {
    const dbPath = join(dir, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, values) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values),
    });
    await post('/projects', { name: 'Completion regression' });
    await post('/projects/1/tasks', { title: 'Done task' });
    const html = await (await fetch(`${server.base}/projects/1`)).text();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    let navigations = 0;
    let removed = false;
    let alert;
    let fail = false;
    let gate = Promise.resolve();
    const filter = {
      value: 'All',
      form: { requestSubmit() { navigations++; } },
      addEventListener(type, handler) { this[type] = handler; },
    };
    const checkbox = {
      checked: false, disabled: false,
      form: {
        action: `${server.base}/projects/1/tasks/1`,
        before(element) { alert = element; },
      },
      closest() { return { remove() { removed = true; } }; },
      addEventListener(type, handler) { this[type] = handler; },
    };
    const flush = runInNewContext(script + '\n(() => Promise.all(pendingUpdates))', {
      document: {
        getElementById: () => filter,
        querySelectorAll: () => [checkbox],
        createElement: () => ({ setAttribute(name, value) { this[name] = value; } }),
      },
      URLSearchParams,
      FormData: class {
        *[Symbol.iterator]() { yield ['filter', filter.value]; }
      },
      fetch: async (...args) => {
        await gate;
        return fail ? { ok: false } : fetch(...args);
      },
    });
    for (const completed of [true, false, true, false]) {
      checkbox.checked = completed;
      checkbox.change();
      assert.equal(checkbox.disabled, true);
      await flush();
      assert.equal(checkbox.checked, completed);
      assert.equal(checkbox.disabled, false);
      assert.equal(navigations, 0);
      const saved = await (await fetch(`${server.base}/projects/1`)).text();
      assert.equal(/aria-label="Complete Done task" checked/.test(saved), completed);
    }
    // Filtering must not navigate away before a pending write finishes.
    let release;
    gate = new Promise((resolve) => { release = resolve; });
    checkbox.checked = true;
    checkbox.change();
    filter.value = 'Open';
    const filtering = filter.change();
    assert.equal(navigations, 0);
    release();
    await filtering;
    assert.equal(navigations, 1);
    assert.equal(removed, true);
    filter.value = 'All';
    fail = true;
    checkbox.checked = false;
    checkbox.change();
    await flush();
    assert.equal(checkbox.checked, true);
    assert.equal(checkbox.disabled, false);
    assert.equal(alert.role, 'alert');
    assert.match(alert.textContent, /Unable to save/);
    fail = false;
    checkbox.checked = false;
    checkbox.change();
    await flush();
    await server.stop();
    server = await start(dbPath);
    const saved = await (await fetch(`${server.base}/projects/1`)).text();
    assert.doesNotMatch(saved, /aria-label="Complete Done task" checked/);
    assert.doesNotMatch(saved, /onchange="this.form.requestSubmit\(\)"/);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('project creation, validation, navigation and restart persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(dir, 'nested', 'projects.sqlite');
    server = await start(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    let html = await (await fetch(server.base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);

    const create = (name) => fetch(`${server.base}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    for (const name of ['', '  \t  ']) {
      html = await (await create(name)).text();
      assert.match(html, /role="alert">Project name is required/);
      assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);
    }
    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    await create('Second <project> & "test"');
    html = await (await fetch(server.base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    assert.match(html, /Second &lt;project&gt; &amp; &quot;test&quot;/);
    const projectPath = html.match(/action="(\/projects\/\d+)"/)[1];
    const detail = await (await fetch(`${server.base}${projectPath}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/99999`)).status, 404);

    await server.stop();
    server = await start(dbPath);
    const restarted = await (await fetch(server.base)).text();
    assert.equal(restarted, html);
    assert.equal(await (await fetch(`${server.base}${projectPath}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
