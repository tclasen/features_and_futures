import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createContext, runInContext } from 'node:vm';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Startup timeout')); }, 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Exited: ${code}`)); });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  };
}

test('tasks validate, filter, remain project-owned, and persist completion across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let app;
  try {
    const dbPath = join(dir, 'test.sqlite');
    app = await start(dbPath);
    const get = async path => (await fetch(app.url + path)).text();
    const post = (path, fields) => fetch(app.url + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    let text = await get('/projects/1');
    assert.match(text, /<label for="task-title">Task title<\/label>/);
    assert.match(text, />Create task<\/button>/);
    assert.match(text, /<label for="task-filter">Task filter<\/label>/);
    assert.match(text, /<option selected>All<\/option>/);
    for (const title of ['', '  \t']) {
      text = await (await post('/projects/1/tasks', { title })).text();
      assert.match(text, /role="alert">Task title is required/);
      assert.doesNotMatch(text, /data-testid="task-row"/);
    }
    await post('/projects/1/tasks', { title: '  First task  ' });
    await post('/projects/1/tasks', { title: 'Second <task>' });
    text = await get('/projects/1');
    assert.equal((text.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(text.indexOf('First task') < text.indexOf('Second &lt;task&gt;'));
    assert.match(text, /aria-label="Complete First task"/);
    assert.doesNotMatch(text, / checked/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    // Exercise the actual page script: completion must save without replacing
    // the checkbox/page, so a later uncheck cannot be lost to a stale navigation.
    const listeners = {};
    const checkbox = {
      checked: false, disabled: false,
      form: { action: app.url + '/projects/1/tasks/1' },
      addEventListener(type, handler) { listeners[type] = handler; }
    };
    const context = createContext({
      document: {
        querySelectorAll: () => [checkbox],
        addEventListener() {},
        createElement() { throw new Error('Unexpected save failure'); }
      },
      URLSearchParams,
      FormData: class { constructor() { return [['filter', 'All']]; } },
      fetch
    });
    runInContext(text.match(/<script>([\s\S]*?)<\/script>/)[1], context);
    for (const completed of [true, false]) {
      checkbox.checked = completed;
      listeners.change();
      assert.equal(checkbox.disabled, true);
      await runInContext('saving', context);
      assert.equal(checkbox.disabled, false);
      assert.equal(checkbox.checked, completed);
      assert.equal(/Complete First task" checked/.test(await get('/projects/1')), completed);
    }
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1', { completed: '1' })).status, 303);
    text = await get('/projects/1?filter=Completed');
    assert.match(text, /Complete First task" checked/);
    assert.doesNotMatch(text, /Second &lt;task&gt;/);
    text = await get('/projects/1?filter=Open');
    assert.match(text, /Second &lt;task&gt;/);
    assert.doesNotMatch(text, /First task/);
    const saved = await get('/projects/1');
    await app.stop();
    app = await start(dbPath);
    assert.equal(await get('/projects/1'), saved);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal(((await get('/projects/1?filter=Open')).match(/data-testid="task-row"/g) || []).length, 2);
    assert.equal((await post('/projects/999/tasks', { title: 'No' })).status, 404);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('projects validate, preserve order and identity, and survive restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(dir, 'nested', 'test.sqlite');
  let app;
  try {
    app = await start(dbPath);
    const get = path => fetch(app.url + path);
    const create = name => fetch(app.url + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let text = await (await get('/')).text();
    assert.match(text, /<h1>Workboard<\/h1>/);
    assert.match(text, /<label for="project-name">Project name<\/label>/);
    assert.match(text, />Create project<\/button>/);
    for (const name of ['', '   \t']) {
      const response = await create(name);
      text = await response.text();
      assert.match(text, /role="alert">Project name is required/);
      assert.equal((text.match(/data-testid="project-row"/g) || []).length, 0);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    text = await (await get('/')).text();
    assert.equal((text.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(text.indexOf('First project') < text.indexOf('Second &lt;project&gt;'));
    const paths = [...text.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
    assert.match(await (await get(paths[1])).text(), /<h1>Second &lt;project&gt;<\/h1>/);
    assert.match(await (await get(paths[0])).text(), />Projects<\/button>/);
    await create('  ');
    assert.equal(await (await get('/')).text(), text);
    await app.stop();
    app = await start(dbPath);
    assert.equal(await (await get('/')).text(), text);
    assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
    assert.equal((await get('/projects/999999')).status, 404);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
