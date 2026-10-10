import test from 'node:test';
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
  let logs = '';
  child.stderr.on('data', (data) => { logs += data; });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${logs}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${logs}`)); });
    child.stdout.on('data', (data) => {
      const match = /listening on port (\d+)/.exec(String(data));
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    base,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('project validation, creation order, routes and persistence across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'projects.sqlite');
    server = await start(databasePath);
    const request = (path, options) => fetch(server.base + path, options);
    const create = (name) => request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    for (const name of ['', ' \t\n ', null, 23]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await request('/api/projects')).json(), []);
    const firstResponse = await create('  First project \n');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>Second</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await request('/api/projects/99999')).status, 404);
    const invalidJson = await request('/api/projects', { method: 'POST', body: '{' });
    assert.equal(invalidJson.status, 400);
    assert.equal((await request('/api/projects', { method: 'POST', body: 'x'.repeat(65537) })).status, 413);
    const html = await (await request('/')).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /Create project/);
    assert.match(html, /role="alert"/);
    assert.equal(await (await request(`/projects/${first.id}`)).text(), html);
    assert.match(await (await request('/app.js')).text(), /row.dataset.testid = 'project-row'/);
    assert.equal((await request('/styles.css')).status, 200);
    assert.equal((await request('/missing')).status, 404);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await (await request('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await request(`/api/projects/${first.id}`)).json(), first);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
