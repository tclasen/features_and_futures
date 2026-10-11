import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

test('project validation, creation order, routing, and restart persistence', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let child;
  let origin;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: `${directory}/projects.sqlite` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolveReady, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { origin = `http://127.0.0.1:${match[1]}`; clearTimeout(timeout); resolveReady(); }
      });
    });
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolveExit => child.once('exit', resolveExit));
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = path => fetch(`${origin}${path}`);
  const create = name => fetch(`${origin}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  try {
    await start();
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    for (const name of ['', ' \t\n ', null]) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`, '/app.js', '/style.css']) {
      assert.equal((await get(path)).status, 200);
    }
    assert.equal((await get('/api/projects/999999')).status, 404);
    await stop();
    await start();
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${second.id}`)).json(), second);
    const third = await (await create('Third project')).json();
    assert.ok(third.id > second.id);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
