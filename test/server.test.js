import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const baseUrl = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${errors}`));
    }, 5000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolveUrl(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    request: (path, options) => fetch(`${baseUrl}${path}`, options),
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate names, preserve order and IDs across process restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'test-'));
  const databasePath = resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await server.request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await (await server.request('/api/projects')).json(), []);

    for (const name of ['', '   ', null]) {
      const response = await server.request('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await server.request('/api/projects')).json(), []);
    const projects = [];
    for (const name of ['  First project  ', '<b>Second project</b>']) {
      const response = await server.request('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      assert.equal(response.status, 201);
      projects.push(await response.json());
    }
    assert.equal(projects[0].name, 'First project');
    assert.equal(projects[1].name, '<b>Second project</b>');
    assert.ok(projects[0].id < projects[1].id);
    assert.deepEqual(await (await server.request('/api/projects')).json(), projects);
    assert.deepEqual(
      await (await server.request(`/api/projects/${projects[0].id}`)).json(),
      projects[0],
    );
    assert.equal((await server.request('/api/projects/99999')).status, 404);
    assert.equal((await server.request('/api/projects', { method: 'POST', body: '{' })).status, 400);
    for (const path of ['/', `/projects/${projects[0].id}`]) {
      const page = await server.request(path);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<title>Workboard<\/title>/);
    }
    assert.equal((await server.request('/app.js')).status, 200);
    assert.equal((await server.request('/styles.css')).status, 200);

    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(await (await server.request('/api/projects')).json(), projects);
    assert.deepEqual(
      await (await server.request(`/api/projects/${projects[1].id}`)).json(),
      projects[1],
    );
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
