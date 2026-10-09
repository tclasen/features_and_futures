import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

async function unusedPort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('projects are validated, ordered, retrievable and persistent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'nested', 'test.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const response = await fetch(`${base}/health`);
        if (response.ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Server failed to start: ${output}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const list = async () => (await fetch(`${base}/api/projects`)).json();
  const create = (name) => fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  try {
    await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await list(), []);
    for (const name of ['', '   ', null, 42]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await list(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<b>Second</b>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.equal((await fetch(`${base}/api/projects/99999`)).status, 404);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /<h1>Workboard<\/h1>/);
      assert.match(html, /<label for="project-name">Project name<\/label>/);
      assert.match(html, /Create project/);
      assert.match(html, />Projects<\/button>/);
    }
    assert.equal((await fetch(`${base}/app.js`)).status, 200);
    const invalid = await fetch(`${base}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(invalid.status, 400);
    await stop();
    await start();
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
