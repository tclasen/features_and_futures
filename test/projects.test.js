import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openProjectStore } from '../database.js';

async function startServer(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
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
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const [code] = await exited;
      assert.equal(code, 0, errors);
    },
  };
}

test('project store trims names, rejects invalid names, and preserves creation order', () => {
  const store = openProjectStore(':memory:');
  try {
    for (const name of ['', ' \t\n', null, 123]) {
      assert.throws(() => store.create(name), /Project name is required/);
    }
    assert.deepEqual(store.list(), []);
    const first = store.create('  First project  ');
    const second = store.create('Second project');
    assert.equal(first.name, 'First project');
    assert.notEqual(first.id, second.id);
    assert.deepEqual(store.list(), [first, second]);
    assert.deepEqual(store.find(first.id), first);
    assert.equal(store.find(999), undefined);
  } finally {
    store.close();
  }
});

test('HTTP contract and project identity survive server restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(dbPath);
    let response = await fetch(`${server.url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    response = await fetch(`${server.url}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<title>Workboard<\/title>/);
    for (const name of ['', '  ', null]) {
      response = await fetch(`${server.url}/api/projects`, {
        method: 'POST', body: JSON.stringify({ name }),
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    response = await fetch(`${server.url}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(response.status, 400);
    response = await fetch(`${server.url}/api/projects`);
    assert.deepEqual(await response.json(), []);
    const projects = [];
    for (const name of ['  Café 🌻  ', '<script>alert(1)</script>', 'Café 🌻']) {
      response = await fetch(`${server.url}/api/projects`, {
        method: 'POST', body: JSON.stringify({ name }),
      });
      assert.equal(response.status, 201);
      const project = await response.json();
      assert.equal(project.name, name.trim());
      projects.push(project);
    }
    await server.stop();
    server = undefined;
    server = await startServer(dbPath);
    response = await fetch(`${server.url}/api/projects`);
    assert.deepEqual(await response.json(), projects);
    for (const project of projects) {
      response = await fetch(`${server.url}/api/projects/${project.id}`);
      assert.deepEqual(await response.json(), project);
      response = await fetch(`${server.url}/projects/${project.id}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /src="\/app.js"/);
    }
    response = await fetch(`${server.url}/api/projects/999`);
    assert.equal(response.status, 404);
    for (const path of ['/app.js', '/styles.css']) {
      response = await fetch(`${server.url}${path}`);
      assert.equal(response.status, 200);
    }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
