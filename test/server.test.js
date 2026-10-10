import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('projects validate, stay ordered, and survive server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = 20000 + Math.floor(Math.random() * 30000);
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    for (let i = 0; i < 100; i++) {
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await new Promise(resolve => setTimeout(resolve, 30)); }
    }
    throw new Error('Server did not become healthy');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function create(name) {
    return fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
  }
  try {
    await start();
    const page = await (await fetch(base)).text();
    assert.match(page, /<h1>Workboard<\/h1>/);
    const script = await (await fetch(`${base}/app.js`)).text();
    for (const label of ['Project name', 'Create project', 'Open project', 'Projects', 'project-row']) {
      assert.ok(script.includes(label));
    }
    for (const blank of ['', '  \t\n']) {
      const response = await create(blank);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('Second project')).json();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
