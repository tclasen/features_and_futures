import { test } from 'node:test';
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
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
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

test('project validation, navigation, creation order, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(databasePath);
    let response = await fetch(`${server.url}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });

    const create = (name) => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '  \t\n ']) {
      response = await create(name);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    response = await create('  Alpha & <team>  ');
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
    assert.equal((await create('Beta')).status, 303);

    const html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(html.indexOf('Alpha &amp; &lt;team&gt;') < html.indexOf('Beta'));
    const projectPath = html.match(/action="(\/projects\/\d+)" method="get"/)[1];
    const detail = await (await fetch(`${server.url}${projectPath}`)).text();
    assert.match(detail, /<h1>Alpha &amp; &lt;team&gt;<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
    assert.equal(await (await fetch(server.url)).text(), html);

    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.equal(await (await fetch(server.url)).text(), html);
    assert.equal(await (await fetch(`${server.url}${projectPath}`)).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
