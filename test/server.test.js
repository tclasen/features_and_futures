import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    base,
    stop: () => new Promise(resolve => {
      child.once('exit', resolve);
      child.kill('SIGTERM');
    }),
  };
}

test('projects validate, render safely, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp('data-test-');
  let server;
  try {
    server = await start(join(directory, 'workboard.sqlite'));
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = name => fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    let html = await (await fetch(server.base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    html = await (await create(' \t ')).text();
    assert.match(html, /role="alert">Project name is required/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    assert.equal((await create('  Alpha  ')).status, 303);
    assert.equal((await create('<Second>')).status, 303);
    html = await (await fetch(server.base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(html.indexOf('Alpha') < html.indexOf('&lt;Second&gt;'));
    assert.match(html, /<span>Alpha<\/span>/);
    const path = html.match(/action="(\/projects\/\d+)"/)[1];
    const detail = await (await fetch(`${server.base}${path}`)).text();
    assert.match(detail, /<h1>Alpha<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    await server.stop();
    server = undefined;
    server = await start(join(directory, 'workboard.sqlite'));
    assert.equal(await (await fetch(server.base)).text(), html);
    assert.equal(await (await fetch(`${server.base}${path}`)).text(), detail);
    assert.equal((await fetch(`${server.base}/projects/9999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
