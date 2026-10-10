import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

test('project validation, navigation, ordering, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    throw new Error(`Server did not start: ${output}`);
  }

  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }

  async function create(name) {
    return fetch(`${base}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
  }

  try {
    await start();
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);

    for (const blank of ['', '  \t\n ']) {
      const response = await create(blank);
      const html = await response.text();
      assert.equal(response.status, 422);
      assert.match(html, /role="alert">Project name is required/);
      assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);
    }

    for (const name of ['  First project  ', 'Second <project> 🎉']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const html = await (await fetch(base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, />First project<\/span>/);
    assert.match(html, /Second &lt;project&gt; 🎉/);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    const ids = [...html.matchAll(/action="\/projects\/(\d+)"/g)].map(match => match[1]);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
    const detail = await (await fetch(`${base}/projects/${ids[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);

    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), html);
    assert.equal(await (await fetch(`${base}/projects/${ids[0]}`)).text(), detail);
    assert.equal((await fetch(`${base}/projects/999999`)).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
