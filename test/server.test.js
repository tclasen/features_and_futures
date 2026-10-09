import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

test('project validation, ordering, routes, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(errors);
      try {
        const response = await fetch(base + '/health');
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await new Promise(resolve => setTimeout(resolve, 25)); }
    }
    throw new Error('Server did not start: ' + errors);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function create(name) {
    return fetch(base + '/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
  }
  try {
    await start();
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), []);
    for (const name of ['', '   ', '\t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /Project name is required/);
    }
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('Second project')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await fetch(base + '/api/projects/' + first.id)).json(), first);
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /Workboard/);
    assert.match(html, /Project name/);
    assert.match(html, /Create project/);
    assert.match(html, /Open project/);
    assert.match(html, /project-row/);
    assert.equal((await fetch(base + '/projects/' + first.id)).status, 200);
    assert.equal((await fetch(base + '/api/projects/999999')).status, 404);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await fetch(base + '/api/projects/' + first.id)).json(), first);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
