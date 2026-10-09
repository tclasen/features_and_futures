import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const process = spawn(globalThis.process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...globalThis.process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { process.kill(); reject(new Error('Server startup timed out')); }, 5000);
    process.on('error', error => { clearTimeout(timeout); reject(error); });
    process.on('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}; ${output}`)); });
    process.stderr.on('data', chunk => { output += chunk; });
    process.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/Workboard listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    });
  });
  return {
    url,
    async stop() {
      const exited = once(process, 'exit');
      process.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, keep creation order and identities, and persist after restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(dir, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = async path => {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      return response.json();
    };
    const create = name => fetch(server.url + '/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    assert.deepEqual(await get('/health'), { status: 'ok' });
    assert.deepEqual(await get('/api/projects'), []);
    for (const name of ['', '   \t\n']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await get('/api/projects'), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<b>Second & project</b>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await get('/api/projects'), [first, second]);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    const htmlResponse = await fetch(server.url + `/projects/${first.id}`);
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.match(html, /role="alert"/);
    assert.match(html, />Projects<\/button>/);
    for (const path of ['/', '/app.js', '/styles.css']) {
      assert.equal((await fetch(server.url + path)).status, 200);
    }
    assert.equal((await fetch(server.url + '/api/projects/999999')).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual(await get('/api/projects'), [first, second]);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    assert.deepEqual(await get('/health'), { status: 'ok' });
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
