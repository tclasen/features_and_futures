import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

test('project validation, order, routes, and persistence across server restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: resolve(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const response = await fetch(origin + '/health');
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await new Promise(resolve => setTimeout(resolve, 30)); }
    }
    throw new Error('Server failed to start: ' + output);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  async function create(name) {
    return fetch(origin + '/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
  }
  async function list() {
    return (await fetch(origin + '/api/projects')).json();
  }
  try {
    await start();
    assert.deepEqual(await list(), []);
    for (const name of ['', '  \n\t ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await list(), []);
    }
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<Second & project>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await list(), [first, second]);
    for (const path of ['/', `/projects/${first.id}`]) {
      const page = await fetch(origin + path);
      assert.equal(page.status, 200);
      assert.match(page.headers.get('content-type'), /text\/html/);
      const html = await page.text();
      assert.match(html, /<label for="project-name">Project name<\/label>/);
      assert.match(html, /Create project/);
      assert.match(html, /row\.dataset\.testid = 'project-row'/);
    }
    assert.deepEqual(await (await fetch(origin + `/api/projects/${first.id}`)).json(), first);
    assert.equal((await fetch(origin + '/api/projects/999999')).status, 404);
    await stop();
    await start();
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await (await fetch(origin + `/api/projects/${first.id}`)).json(), first);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
