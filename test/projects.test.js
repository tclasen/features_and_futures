import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn('npm', ['start'], {
    cwd: resolve('.'),
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const stop = async () => {
    if (child.exitCode !== null) return;
    const exited = once(child, 'exit');
    process.kill(-child.pid, 'SIGTERM');
    await exited;
  };
  try {
    const url = await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 10000);
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/Workboard listening on port (\d+)/);
        if (match) { clearTimeout(timer); accept(`http://127.0.0.1:${match[1]}`); }
      });
      child.stderr.on('data', chunk => { output += chunk; });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited (${code}): ${output}`)); });
    });
    return { url, stop };
  } catch (error) { await stop(); throw error; }
}

test('projects, shared launch interface, and persistence through restart', async () => {
  const directory = mkdtempSync(resolve('.workboard-test-'));
  const dbPath = resolve(directory, 'nested/projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const call = async (path, options) => {
      const response = await fetch(server.url + path, options);
      return { status: response.status, body: await response.json() };
    };
    const create = name => call('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    assert.deepEqual(await call('/health'), { status: 200, body: { status: 'ok' } });
    assert.deepEqual((await call('/api/projects')).body, []);
    for (const name of ['', '   \t\n']) {
      assert.deepEqual(await create(name), { status: 400, body: { error: 'Project name is required' } });
    }
    assert.deepEqual((await call('/api/projects')).body, []);
    const first = await create('  First project  ');
    const second = await create('Second project');
    const third = await create('<script>alert("name")</script>');
    assert.equal(first.status, 201);
    assert.equal(first.body.name, 'First project');
    assert.notEqual(first.body.id, second.body.id);
    const expected = [first.body, second.body, third.body];
    assert.deepEqual((await call('/api/projects')).body, expected);
    assert.deepEqual((await call(`/api/projects/${first.body.id}`)).body, first.body);
    assert.equal((await call('/api/projects/999999')).status, 404);
    for (const path of ['/', `/projects/${first.body.id}`, '/app.js', '/styles.css']) {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      assert.ok((await response.text()).length > 0);
    }
    const html = await (await fetch(server.url)).text();
    assert.match(html, /<html lang="en">/);
    await server.stop();
    server = await start(dbPath);
    assert.deepEqual((await call('/api/projects')).body, expected);
    for (const project of expected) {
      assert.deepEqual((await call(`/api/projects/${project.id}`)).body, project);
    }
    const fourth = await create('After restart');
    assert.ok(fourth.body.id > third.body.id);
  } finally {
    if (server) await server.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});
