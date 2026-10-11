import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

async function launch(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (data) => { errors += data; });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited ${code}: ${errors}`)));
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

test('projects validate, trim, preserve order, navigate, and survive a restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = path.resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await launch(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    for (const blank of ['', '   ']) {
      const response = await create(blank);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
    assert.match(list, /<span>First project<\/span>/);
    const projectPaths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(projectPaths.length, 2);
    const detail = await (await fetch(server.url + projectPaths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/"[^>]*><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/9999`)).status, 404);
    await server.stop();
    server = await launch(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(server.url + projectPaths[0])).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
