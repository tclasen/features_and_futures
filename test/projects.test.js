import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const url = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 10000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolveUrl(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
  });
  return { url, async stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  } };
}

test('projects validate, retain creation order, and survive a restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'test-'));
  const databasePath = resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = async path => {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      return response.json();
    };
    const create = name => fetch(server.url + '/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    assert.deepEqual(await get('/health'), { status: 'ok' });
    assert.deepEqual(await get('/api/projects'), []);
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await get('/api/projects'), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.ok(first.id);
    const secondResponse = await create('Second project');
    const second = await secondResponse.json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await get('/api/projects'), [first, second]);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      const page = await response.text();
      assert.match(page, /<h1>Workboard<\/h1>/);
      assert.match(page, /<label for="project-name">Project name<\/label>/);
      assert.match(page, /Create project/);
      assert.match(page, /role="alert"/);
    }
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await get('/api/projects'), [first, second]);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
