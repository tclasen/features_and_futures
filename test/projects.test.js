import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Server exited: ${code}, ${output}`)));
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, trim, render safely, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.url}/projects`, {
        method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
      });
    }
    for (const name of ['', '   \t\n']) {
      const invalid = await create(name);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <script>alert(1)</script>')).status, 303);
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /Second &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;'));
    const path = list.match(/action="(\/projects\/\d+)"/)[1];
    const detail = await (await fetch(`${server.url}${path}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
    await server.stop();
    server = await start(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(`${server.url}${path}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
