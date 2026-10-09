import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${errors}`));
    }, 5000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, navigate, and retain names and IDs after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const getList = async () => (await fetch(`${server.baseUrl}/`)).text();
    const create = name => fetch(`${server.baseUrl}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const initial = await getList();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    const first = await create('  Launch plan  ');
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/');
    assert.equal((await create('Research <script>alert("x")</script>')).status, 303);
    const list = await getList();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /class="project-name">Launch plan<\/span>/);
    assert.ok(list.indexOf('Launch plan') < list.indexOf('Research &lt;script&gt;'));
    assert.doesNotMatch(list, /<script>alert/);
    const routes = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(routes.length, 2);
    assert.notEqual(routes[0], routes[1]);
    const detail = await (await fetch(`${server.baseUrl}${routes[0]}`)).text();
    assert.match(detail, /<h1>Launch plan<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.baseUrl}/projects/999999`)).status, 404);

    const invalidAfterCreation = await create('   ');
    assert.equal(((await invalidAfterCreation.text()).match(/data-testid="project-row"/g) || []).length, 2);
    assert.equal(await getList(), list);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await getList(), list);
    assert.equal(await (await fetch(`${server.baseUrl}${routes[0]}`)).text(), detail);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
