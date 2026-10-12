import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const process = spawn(globalThis.process.execPath, ['server.js'], {
    env: { ...globalThis.process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const base = await new Promise((resolve, reject) => {
    process.on('error', reject);
    process.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    process.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
  });
  return { base, async stop() { const exited = once(process, 'exit'); process.kill('SIGTERM'); await exited; } };
}

test('projects validate, navigate, escape names, and survive restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const database = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(database);
    const get = path => fetch(server.base + path);
    const create = name => fetch(server.base + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.match(await (await get('/')).text(), /<h1>Workboard<\/h1>/);
    const invalid = await create('   ');
    assert.equal(invalid.status, 422);
    const invalidHtml = await invalid.text();
    assert.match(invalidHtml, /role="alert">Project name is required/);
    assert.doesNotMatch(invalidHtml, /data-testid="project-row"/);
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('<Second & project>')).status, 303);
    const listing = await (await get('/')).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;Second &amp; project&gt;'));
    assert.match(listing, /action="\/projects\/1"/);
    const detail = await (await get('/projects/1')).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    await server.stop();
    server = await start(database);
    assert.equal(await (await get('/')).text(), listing);
    assert.equal(await (await get('/projects/1')).text(), detail);
    assert.equal((await get('/projects/999')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
