import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('projects validate, retain creation order, and survive a server restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'nested', 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Server exited with ${code}`)));
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) {
          base = `http://127.0.0.1:${match[1]}`;
          resolve();
        }
      });
    });
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  const get = (path) => fetch(`${base}${path}`);
  const create = (name) => fetch(`${base}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  try {
    await start();
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    for (const name of ['', '   \n\t']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<b>Second project</b>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await get('/api/projects/999999')).status, 404);
    for (const path of ['/', `/projects/${first.id}`]) {
      const page = await get(path);
      assert.equal(page.status, 200);
      assert.match(page.headers.get('content-type'), /text\/html/);
      assert.match(await page.text(), /<h1>Workboard<\/h1>/);
    }
    for (const path of ['/app.js', '/style.css']) assert.equal((await get(path)).status, 200);
    await stop();
    await start();
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second, third]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
