import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const port = await new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Server startup timed out')); }, 5000);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${errors}`)); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolvePort(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise(resolveStop => {
      child.once('exit', resolveStop);
      child.kill('SIGTERM');
    }),
  };
}

test('projects validate, trim, retain creation order, navigate, and persist across restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const databasePath = resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    let html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /Create project/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    for (const name of ['', '   \t ']) {
      const invalid = await create(name);
      html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    html = await (await fetch(server.url)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    const second = await (await fetch(`${server.url}${paths[1]}`)).text();
    assert.match(second, /<h1>Second &lt;project&gt;<\/h1>/);
    await server.stop();
    server = await start(databasePath);
    const persisted = await (await fetch(server.url)).text();
    assert.equal(persisted, html);
    assert.match(await (await fetch(`${server.url}${paths[0]}`)).text(), /<h1>First project<\/h1>/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
