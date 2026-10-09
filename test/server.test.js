import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const port = await new Promise((resolve, reject) => {
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Server did not start: ${stderr}`));
    }, 5000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${stderr}`));
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const match = stdout.match(/Workboard listening on port (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, retain creation order and survive server restarts', { timeout: 20000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  t.after(async () => {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  });
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  server = await startServer(databasePath);
  const get = (path) => fetch(server.url + path);
  const create = (name) => fetch(server.url + '/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  const health = await get('/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.deepEqual(await (await get('/api/projects')).json(), []);

  for (const name of ['', ' \t\n ', null, 42]) {
    const response = await create(name);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Project name is required' });
  }
  assert.deepEqual(await (await get('/api/projects')).json(), []);

  const firstResponse = await create('  First project  ');
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json();
  assert.equal(first.name, 'First project');
  assert.ok(Number.isSafeInteger(first.id));
  const second = await (await create('日本語 <script>alert(1)</script>')).json();
  const duplicate = await (await create('First project')).json();
  assert.notEqual(first.id, duplicate.id);
  const expected = [first, second, duplicate];
  assert.deepEqual(await (await get('/api/projects')).json(), expected);
  assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
  assert.equal((await get('/api/projects/999999')).status, 404);
  assert.equal((await get('/api/projects/999999999999999999999')).status, 404);

  const malformed = await fetch(server.url + '/api/projects', { method: 'POST', body: '{' });
  assert.equal(malformed.status, 400);
  const oversized = await create('a'.repeat(70000));
  assert.equal(oversized.status, 413);
  assert.deepEqual(await (await get('/api/projects')).json(), expected);

  const home = await get('/');
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /<h1 id="heading">Workboard<\/h1>/);
  assert.match(html, /<label for="project-name">Project name<\/label>/);
  assert.match(html, />Create project<\/button>/);
  assert.match(html, /role="alert"/);
  const detail = await get(`/projects/${first.id}`);
  assert.equal(detail.status, 200);
  assert.equal(await detail.text(), html);
  assert.equal((await get('/app.js')).status, 200);
  assert.equal((await get('/style.css')).status, 200);
  assert.equal((await get('/missing')).status, 404);

  await server.stop();
  server = await startServer(databasePath);
  assert.deepEqual(await (await get('/api/projects')).json(), expected);
  for (const project of expected) {
    assert.deepEqual(await (await get(`/api/projects/${project.id}`)).json(), project);
    assert.equal((await get(`/projects/${project.id}`)).status, 200);
  }
  const later = await (await create('After restart')).json();
  assert.ok(later.id > duplicate.id);
});
