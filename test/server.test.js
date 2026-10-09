import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(databasePath) {
  // Port zero lets the OS select an available port without a reservation race.
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import http from 'node:http';
    const listen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
      this.once('listening', () => console.log('PORT=' + this.address().port));
      return listen.apply(this, args);
    };
    await import('./server.js');
  `], { env: { ...process.env, PORT: '0', DB_PATH: databasePath }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${stderr}`));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/PORT=(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(stderr)); });
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

test('launch contract, project validation, ordering, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'projects.sqlite');
    server = await start(databasePath);
    const get = (path) => fetch(server.url + path);
    const create = (name) => fetch(server.url + '/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const html = await (await get('/')).text();
    assert.match(html, /<h1[^>]*>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /Create project/);
    for (const name of ['', ' \t\n ', null, 42]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const firstResponse = await create('  Pilot  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'Pilot');
    const second = await (await create('<script>alert(1)</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await get(`/projects/${first.id}`)).status, 200);
    assert.equal((await get('/api/projects/999999')).status, 404);
    assert.equal((await get('/missing')).status, 404);
    const malformed = await fetch(server.url + '/api/projects', { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
