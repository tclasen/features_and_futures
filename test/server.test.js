import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Startup timed out')); }, 5000);
    child.on('error', reject);
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    child.stdout.on('data', chunk => {
      const match = chunk.toString().match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return { url, stop: async () => { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } };
}

test('projects validate, navigate, and persist across server restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(dir, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let body = await (await fetch(server.url)).text();
    assert.match(body, /<h1>Workboard<\/h1>/);
    assert.match(body, /<label for="project-name">Project name<\/label>/);
    assert.equal((body.match(/data-testid="project-row"/g) || []).length, 0);
    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    for (const name of ['', '   ']) {
      body = await (await create(name)).text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    await create('Second <project>');
    body = await (await fetch(server.url)).text();
    assert.equal((body.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(body, />First project<\/span>/);
    assert.ok(body.indexOf('First project') < body.indexOf('Second &lt;project&gt;'));
    const projectPath = body.match(/action="(\/projects\/\d+)"/)[1];
    const detail = await (await fetch(server.url + projectPath)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<button type="submit">Projects<\/button>/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await fetch(server.url)).text(), body);
    assert.equal(await (await fetch(server.url + projectPath)).text(), detail);
    assert.equal((await fetch(server.url + '/projects/99999')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
