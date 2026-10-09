import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

async function start(databasePath) {
  const process = spawn(globalThis.process.execPath, ['server.js'], {
    env: { ...globalThis.process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    process.on('error', reject);
    process.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    process.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(process, 'exit');
      process.kill('SIGTERM');
      await exited;
    },
  };
}

test('tasks validate, filter, stay project-scoped, and persist completion', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-tasks-');
  let server;
  try {
    const dbPath = resolve(directory, 'test.sqlite');
    server = await start(dbPath);
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const get = async path => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    const blank = await post('/projects/1/tasks', { title: '   ' });
    assert.match(await blank.text(), /role="alert">Task title is required/);
    assert.doesNotMatch(await get('/projects/1'), /data-testid="task-row"/);
    await post('/projects/1/tasks', { title: '  Alpha & <task>  ' });
    await post('/projects/1/tasks', { title: 'Beta' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option>/);
    assert.match(html, /aria-label="Complete Alpha &amp; &lt;task&gt;"/);
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(html.indexOf('<span>Alpha') < html.indexOf('<span>Beta'));
    assert.doesNotMatch(html, / checked/);
    assert.doesNotMatch(await get('/projects/2'), /data-testid="task-row"/);
    assert.equal((await post('/projects/2/tasks/1', { completed: '1' })).status, 404);
    await post('/projects/1/tasks/1', { completed: '1' });
    const completed = await get('/projects/1?filter=Completed');
    assert.match(completed, /<span>Alpha &amp; &lt;task&gt;<\/span>/);
    assert.match(completed, / checked/);
    assert.doesNotMatch(completed, /<span>Beta/);
    const open = await get('/projects/1?filter=Open');
    assert.match(open, /<span>Beta/);
    assert.doesNotMatch(open, /<span>Alpha/);
    html = await get('/projects/1');
    await server.stop();
    server = await start(dbPath);
    assert.equal(await get('/projects/1'), html);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    await post('/projects/1/tasks/1', {});
    assert.doesNotMatch(await get('/projects/1?filter=Completed'), /data-testid="task-row"/);
    assert.equal(((await get('/projects/1?filter=Open')).match(/data-testid="task-row"/g) || []).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('submission locks competing controls and preserves checked and unchecked saves', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-submission-');
  let server;
  try {
    server = await start(resolve(directory, 'test.sqlite'));
    const post = (path, values) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Project' });
    await post('/projects/1/tasks', { title: 'Done task' });
    const html = await (await fetch(`${server.url}/projects/1`)).text();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    for (const checked of [true, false]) {
      const fields = [
        { type: 'hidden', name: 'filter', value: 'All' },
        { type: 'checkbox', name: 'completed', value: '1', checked },
      ];
      const filter = { name: 'filter', value: 'All' };
      const controls = [...fields, filter, {}];
      const listeners = {};
      const successfulValues = form => form.fields
        .filter(field => !field.disabled && field.name &&
          (field.type !== 'checkbox' || field.checked))
        .map(field => [field.name, field.value]);
      const form = { fields, append(input) { this.fields.push(input); } };
      runInNewContext(script, {
        document: {
          addEventListener(name, listener) { listeners[name] = listener; },
          querySelectorAll() { return controls; },
          createElement() { return {}; },
        },
        window: { addEventListener() {} },
        FormData: class {
          constructor(form) { this.values = successfulValues(form); }
          [Symbol.iterator]() { return this.values[Symbol.iterator](); }
        },
      });
      const expected = successfulValues(form);
      listeners.submit({ target: form });
      assert.ok(controls.every(control => control.disabled));
      assert.deepEqual(successfulValues(form), expected);
      await post('/projects/1/tasks/1', successfulValues(form));
      const saved = await (await fetch(`${server.url}/projects/1`)).text();
      assert.equal(/aria-label="Complete Done task" checked/.test(saved), checked);
    }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, render safely, navigate, and persist across restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  let server;
  try {
    const dbPath = resolve(directory, 'test.sqlite');
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const blank = await create('   ');
    const blankHtml = await blank.text();
    assert.match(blankHtml, /role="alert">Project name is required/);
    assert.doesNotMatch(blankHtml, /data-testid="project-row"/);
    assert.equal((await create('  Alpha & <team>  ')).status, 303);
    assert.equal((await create('Beta')).status, 303);
    const html = await (await fetch(server.url)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>Alpha &amp; &lt;team&gt;<\/span>/);
    assert.ok(html.indexOf('Alpha &amp;') < html.indexOf('<span>Beta'));
    const projectPath = html.match(/action="(\/projects\/\d+)"/)[1];
    const detail = await (await fetch(`${server.url}${projectPath}`)).text();
    assert.match(detail, /<h1>Alpha &amp; &lt;team&gt;<\/h1>/);
    assert.match(detail, /action="\/".*?>Projects<\/button>/s);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.url)).text(), html);
    assert.equal(await (await fetch(`${server.url}${projectPath}`)).text(), detail);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
