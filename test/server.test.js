import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  const port = await new Promise((resolvePort, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolvePort(match[1]);
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return { url: `http://127.0.0.1:${port}`, stop: async () => {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  } };
}

test('projects validate, trim, escape, retain order and persist after restart', async () => {
  mkdirSync('data', { recursive: true });
  const dir = mkdtempSync('data/test-');
  const dbPath = resolve(dir, 'test.sqlite');
  let server;
  try {
    server = await start(dbPath);
    let response = await fetch(`${server.url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    let body = await (await fetch(server.url)).text();
    assert.match(body, /<h1>Workboard<\/h1>/);
    assert.match(body, /<label for="project-name">Project name<\/label>/);
    for (const name of ['', '   \t ']) {
      response = await create(name);
      assert.equal(response.status, 422);
      body = await response.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    assert.equal((await create('  Alpha  ')).status, 303);
    assert.equal((await create('Beta <script>')).status, 303);
    body = await (await fetch(server.url)).text();
    assert.equal((body.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(body.indexOf('<span>Alpha</span>') < body.indexOf('<span>Beta &lt;script&gt;</span>'));
    const paths = [...body.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    body = await (await fetch(server.url + paths[0])).text();
    assert.match(body, /<h1>Alpha<\/h1>/);
    assert.match(body, /<button type="submit">Projects<\/button>/);
    await server.stop();
    server = await start(dbPath);
    body = await (await fetch(server.url)).text();
    for (const path of paths) assert.ok(body.includes(`action="${path}"`));
    assert.match(await (await fetch(server.url + paths[1])).text(), /<h1>Beta &lt;script&gt;<\/h1>/);
    assert.equal((await fetch(`${server.url}/projects/9999`)).status, 404);
  } finally {
    if (server) await server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
