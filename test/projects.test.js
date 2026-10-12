import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    url,
    async stop() {
      if (child.exitCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, keep creation order, and persist names and IDs after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const api = async (path, options) => {
      const response = await fetch(`${server.url}${path}`, options);
      return { status: response.status, body: await response.json() };
    };
    const create = (name) => api('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });

    assert.deepEqual(await api('/health'), { status: 200, body: { status: 'ok' } });
    assert.deepEqual((await api('/api/projects')).body, []);
    for (const name of ['', ' \t\n ', null, 42]) {
      assert.deepEqual(await create(name), { status: 400, body: { error: 'Project name is required' } });
    }
    assert.deepEqual((await api('/api/projects')).body, []);
    const first = await create('  First project \n');
    const second = await create('<script>literal text</script>');
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.body.name, 'First project');
    assert.ok(Number.isInteger(first.body.id));
    assert.ok(second.body.id > first.body.id);
    const projects = [first.body, second.body];
    assert.deepEqual((await api('/api/projects')).body, projects);
    assert.deepEqual(await api(`/api/projects/${first.body.id}`), { status: 200, body: first.body });
    assert.equal((await api('/api/projects/999999')).status, 404);
    assert.equal((await api('/missing')).status, 404);
    const invalid = await api('/api/projects', { method: 'POST', body: '{' });
    assert.equal(invalid.status, 400);
    assert.deepEqual((await api('/api/projects')).body, projects);
    for (const path of ['/', `/projects/${first.body.id}`]) {
      const response = await fetch(`${server.url}${path}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(await response.text(), /<title>Workboard<\/title>/);
    }
    for (const path of ['/app.js', '/styles.css']) {
      assert.equal((await fetch(`${server.url}${path}`)).status, 200);
    }
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual((await api('/api/projects')).body, projects);
    assert.deepEqual((await api(`/api/projects/${first.body.id}`)).body, first.body);
    const third = await create('Third');
    assert.ok(third.body.id > second.body.id);
    assert.deepEqual((await api('/api/projects')).body, [...projects, third.body]);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
