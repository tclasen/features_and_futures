import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';

test('projects validate, retain creation order, and survive a server restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const portReservation = createServer();
  portReservation.listen(0, '127.0.0.1');
  await once(portReservation, 'listening');
  const port = portReservation.address().port;
  await new Promise((resolve) => portReservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let diagnostics = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', (chunk) => { diagnostics += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${diagnostics}`);
      try {
        const health = await fetch(`${base}/health`);
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { status: 'ok' });
        return;
      } catch { await new Promise((resolve) => setTimeout(resolve, 25)); }
    }
    throw new Error(`Server did not start: ${diagnostics}`);
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
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    for (const name of ['', '  \t\n  ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>Example</script>')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    const page = await fetch(`${base}/projects/${first.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /src="\/app.js"/);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}`)).json(), second);
    assert.equal((await fetch(`${base}/api/projects/99999`)).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
