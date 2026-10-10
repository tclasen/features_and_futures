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
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

async function stop(server) {
  const exited = once(server.child, 'exit');
  server.child.kill('SIGTERM');
  await exited;
}

test('projects validate, navigate, escape names and persist across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(dir, 'nested', 'projects.sqlite');
    server = await start(dbPath);
    const get = path => fetch(server.url + path);
    const create = name => fetch(server.url + '/projects', {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);
    for (const name of ['', '   \t\n']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const body = await invalid.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    for (const name of ['  Alpha  ', '<Second & project>']) {
      const result = await create(name);
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/');
    }
    const listing = await (await get('/')).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span>Alpha<\/span>/);
    assert.ok(listing.indexOf('Alpha') < listing.indexOf('&lt;Second &amp; project&gt;'));
    assert.match(listing, /action="\/projects\/1"/);
    const detail = await (await get('/projects/1')).text();
    assert.match(detail, /<h1>Alpha<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await get('/projects/999')).status, 404);
    await stop(server);
    server = await start(dbPath);
    assert.equal(await (await get('/')).text(), listing);
    assert.equal(await (await get('/projects/1')).text(), detail);
  } finally {
    if (server && server.child.exitCode === null) await stop(server);
    await rm(dir, { recursive: true, force: true });
  }
});
