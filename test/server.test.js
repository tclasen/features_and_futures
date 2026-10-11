import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

async function availablePort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function start(port, database) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), DB_PATH: database },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', chunk => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return { child, base };
    } catch { /* Wait for the server to bind. */ }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  child.kill();
  throw new Error(`Server did not start: ${output}`);
}

async function stop(child) {
  const exit = once(child, 'exit');
  child.kill('SIGTERM');
  await exit;
}

test('projects validate, keep creation order, and survive server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-'));
  const port = await availablePort();
  const database = join(directory, 'nested', 'projects.sqlite');
  let running;
  try {
    running = await start(port, database);
    const get = path => fetch(`${running.base}${path}`);
    const create = name => fetch(`${running.base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    for (const name of ['', ' \t\n ', null]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<Second project>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await get('/api/projects/99999')).status, 404);
    for (const path of ['/', `/projects/${first.id}`, '/app.js', '/style.css']) {
      assert.equal((await get(path)).status, 200);
    }
    await stop(running.child);
    running = await start(port, database);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    const malformed = await fetch(`${running.base}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
  } finally {
    if (running && running.child.exitCode === null) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});
