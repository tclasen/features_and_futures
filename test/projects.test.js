import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

async function unusedPort() {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

test('projects validate, preserve order, open and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${errors}`);
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    throw new Error(`Server did not start: ${errors}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function create(name) {
    return fetch(`${base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
  }
  try {
    await start();
    let content = await (await fetch(base)).text();
    assert.match(content, /<h1>Workboard<\/h1>/);
    assert.match(content, /Project name<input/);
    assert.match(content, />Create project<\/button>/);
    assert.doesNotMatch(content, /data-testid="project-row"/);
    for (const name of ['', '   ']) {
      content = await (await create(name)).text();
      assert.match(content, /role="alert">Project name is required/);
      assert.doesNotMatch(content, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    content = await (await fetch(base)).text();
    assert.equal((content.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(content, /<span>First project<\/span>/);
    assert.ok(content.indexOf('First project') < content.indexOf('Second &lt;project&gt;'));
    const paths = [...content.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(base + paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${base}/projects/9999`)).status, 404);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), content);
    assert.equal(await (await fetch(base + paths[0])).text(), detail);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
