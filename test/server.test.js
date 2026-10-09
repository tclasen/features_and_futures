import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('projects validation, order, page routes, and restart persistence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(dir, 'nested', 'test.sqlite') },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', data => { stderr += data; });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(stderr);
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    throw new Error(`Server did not start: ${stderr}`);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  const list = async () => (await fetch(`${base}/api/projects`)).json();
  const create = name => fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  try {
    await start();
    assert.deepEqual(await list(), []);
    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Project name is required');
    }
    assert.deepEqual(await list(), []);
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<Second>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const page = await fetch(base + path);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<h1>Workboard<\/h1>/);
    }
    assert.equal((await fetch(`${base}/app.js`)).status, 200);
    assert.equal((await fetch(`${base}/style.css`)).status, 200);
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    await stop();
    await start();
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
