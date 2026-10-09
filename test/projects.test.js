import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Server startup timed out')); }, 5000);
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited (${code}): ${stderr}`)); });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return { url, async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } };
}

test('projects validate, retain creation order, and persist IDs and names across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(directory, 'nested', 'projects.sqlite');
    server = await start(dbPath);
    const get = (path) => fetch(`${server.url}${path}`);
    const create = (name) => fetch(`${server.url}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error, 'Project name is required');
    }
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('Second project')).json();
    const special = await (await create('<script>alert("project")</script>')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second, special];
    assert.deepEqual(await (await get('/api/projects')).json(), expected);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`, '/app.js', '/style.css']) {
      assert.equal((await get(path)).status, 200);
    }
    assert.equal((await get('/api/projects/missing')).status, 404);
    assert.equal((await get('/missing')).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(await (await get('/api/projects')).json(), expected);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    const third = await (await create('After restart')).json();
    assert.deepEqual(await (await get('/api/projects')).json(), [...expected, third]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
