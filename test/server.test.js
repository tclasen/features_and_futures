import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('projects validate, retain creation order, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.once('error', reject);
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    return `http://127.0.0.1:${port}`;
  }
  async function stop() {
    const done = once(child, 'exit');
    child.kill('SIGTERM');
    await done;
    child = undefined;
  }
  try {
    let base = await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = (name) => fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    for (const name of ['', '   \t\n']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Project name is required/);
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<Second & project>')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    const page = await fetch(`${base}/projects/${first.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<label for="project-name">Project name<\/label>/);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    await stop();
    base = await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}`)).json(), second);
    assert.equal((await fetch(`${base}/api/projects/99999`)).status, 404);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
