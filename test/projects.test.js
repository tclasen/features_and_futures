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
  const baseUrl = await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    baseUrl,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render safely, navigate, and persist after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const get = (path) => fetch(server.baseUrl + path);
    const create = (name) => fetch(server.baseUrl + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let body = await (await get('/')).text();
    assert.match(body, /<h1>Workboard<\/h1>/);
    assert.match(body, /<label for="project-name">Project name<\/label>/);
    assert.match(body, />Create project<\/button>/);
    assert.doesNotMatch(body, /data-testid="project-row"/);

    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      body = await response.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('<script> & Second')).status, 303);
    body = await (await get('/')).text();
    assert.equal((body.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(body, /<span>First project<\/span>/);
    assert.match(body, /&lt;script&gt; &amp; Second/);
    assert.ok(body.indexOf('First project') < body.indexOf('&lt;script&gt;'));
    const projectPaths = [...body.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(projectPaths.length, 2);
    body = await (await get(projectPaths[0])).text();
    assert.match(body, /<h1>First project<\/h1>/);
    assert.match(body, /action="\/".*>Projects<\/button>/);
    const beforeRestart = await (await get('/')).text();
    await create('  ');
    assert.equal(await (await get('/')).text(), beforeRestart);
    assert.equal((await get('/projects/999')).status, 404);

    await server.stop();
    server = await start(databasePath);
    assert.equal(await (await get('/')).text(), beforeRestart);
    assert.match(await (await get(projectPaths[0])).text(), /<h1>First project<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
