import { test } from 'node:test';
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
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Startup timed out: ${errors}`));
    }, 5000);
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
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
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  };
}

test('project validation, ordering, navigation, escaping and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const getList = () => fetch(`${server.base}/`).then(response => response.text());
    const create = name => fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    let list = await getList();
    assert.match(list, /<h1>Workboard<\/h1>/);
    assert.match(list, /<label for="project-name">Project name<\/label>/);
    assert.match(list, />Create project<\/button>/);
    assert.doesNotMatch(list, /data-testid="project-row"/);
    for (const name of ['', '  \t  ']) {
      const response = await create(name);
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert">Project name is required/);
    }
    assert.doesNotMatch(await getList(), /data-testid="project-row"/);
    for (const name of ['  First project  ', '<Second & project>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    list = await getList();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /<span>&lt;Second &amp; project&gt;<\/span>/);
    assert.ok(list.indexOf('First project') < list.indexOf('&lt;Second'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await fetch(`${server.base}${paths[0]}`).then(response => response.text());
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/99999`)).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await getList(), list);
    assert.equal(await fetch(`${server.base}${paths[0]}`).then(response => response.text()), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project-scoped tasks, validation, completion, filtering and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const dbPath = join(directory, 'workboard.sqlite');
    server = await start(dbPath);
    const post = (path, fields) => fetch(`${server.base}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const detail = id => fetch(`${server.base}/projects/${id}`).then(res => res.text());
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    for (const title of ['', ' \t ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert"[^>]*>Task title is required/);
    }
    assert.doesNotMatch(await detail(1), /data-testid="task-row">/);
    for (const title of ['  Alpha  ', '<Beta & "quoted">']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    await post('/projects/2/tasks', { title: 'Other task' });
    let content = await detail(1);
    assert.equal((content.match(/data-testid="task-row">/g) || []).length, 2);
    assert.match(content, /<span>Alpha<\/span>/);
    assert.match(content, /aria-label="Complete &lt;Beta &amp; &quot;quoted&quot;&gt;"/);
    assert.ok(content.indexOf('<span>Alpha') < content.indexOf('<span>&lt;Beta'));
    assert.doesNotMatch(content, /Other task/);
    assert.doesNotMatch(await detail(2), /Complete Alpha/);
    assert.doesNotMatch(content, / checked/);
    assert.match(content, /<label for="task-title">Task title<\/label>/);
    assert.match(content, /<label for="task-filter">Task filter<\/label>/);
    assert.match(content, /<option>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: 'true' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: 'invalid' })).status, 400);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: 'true' })).status, 204);
    content = await detail(1);
    assert.match(content, /tasks\/1\/completion" checked/);

    // Execute the browser script with a minimal DOM to check filtering and saves.
    const filter = { value: 'All', addEventListener(type, handler) { this.change = handler; } };
    const alert = { textContent: '' };
    const rows = [true, false].map((checked, index) => {
      const checkbox = {
        checked, dataset: { completionUrl: `/projects/1/tasks/${index + 1}/completion` },
        addEventListener(type, handler) { this.change = handler; }
      };
      return { checkbox, querySelector() { return checkbox; }, hidden: false };
    });
    let saveOk = true;
    runInNewContext(content.match(/<script>([\s\S]*?)<\/script>/)[1], {
      URLSearchParams,
      document: {
        getElementById: id => id === 'task-filter' ? filter : alert,
        querySelectorAll: selector => selector === '[data-testid="task-row"]' ? rows : rows.map(row => row.checkbox)
      },
      fetch: async (path, options) => {
        assert.equal(path, '/projects/1/tasks/1/completion');
        assert.equal(options.body.get('completed'), 'false');
        return { ok: saveOk };
      }
    });
    filter.change();
    assert.deepEqual(rows.map(row => row.hidden), [false, false]);
    filter.value = 'Open';
    filter.change();
    assert.deepEqual(rows.map(row => row.hidden), [true, false]);
    filter.value = 'Completed';
    filter.change();
    assert.deepEqual(rows.map(row => row.hidden), [false, true]);
    rows[0].checkbox.checked = false;
    await rows[0].checkbox.change();
    assert.deepEqual(rows.map(row => row.hidden), [true, true]);
    saveOk = false;
    rows[0].checkbox.checked = false;
    await rows[0].checkbox.change();
    assert.equal(rows[0].checkbox.checked, true);
    assert.match(alert.textContent, /Could not save/);

    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail(1), content);
    assert.match(await detail(2), /Other task/);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: 'false' })).status, 204);
    assert.doesNotMatch(await detail(1), / checked/);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await detail(1), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
