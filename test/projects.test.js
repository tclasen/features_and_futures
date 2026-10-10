import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function startServer(databasePath) {
  const process = spawn('node', ['server.js'], {
    env: { ...globalThis.process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  process.stderr.on('data', chunk => { errors += chunk; });
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      process.kill('SIGKILL');
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    process.once('error', error => { clearTimeout(timeout); reject(error); });
    process.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    process.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  const url = await ready;
  return {
    url,
    async stop() {
      const exited = once(process, 'exit');
      process.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render safely, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    let html = await (await fetch(server.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, /id="project-name" name="name" type="text"/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);

    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    for (const blank of ['', ' \t\n ']) {
      const response = await create(blank);
      html = await response.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    const first = await create('  Alpha project  ');
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/');
    assert.equal((await create('<script>alert("test")</script>')).status, 303);

    html = await (await fetch(server.url)).text();
    const rows = [...html.matchAll(/<div class="project-row" data-testid="project-row">([\s\S]*?)<\/div>/g)];
    assert.equal(rows.length, 2);
    assert.match(rows[0][1], /<span class="project-name">Alpha project<\/span>/);
    assert.match(rows[0][1], />Open project<\/button>/);
    assert.match(rows[1][1], /&lt;script&gt;alert\(&quot;test&quot;\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    const projectPath = /action="(\/projects\/\d+)"/.exec(rows[0][1])[1];
    const detail = await fetch(`${server.url}${projectPath}`);
    assert.equal(detail.status, 200);
    const detailHtml = await detail.text();
    assert.match(detailHtml, /<h1>Alpha project<\/h1>/);
    assert.match(detailHtml, /action="\/"[^>]*><button[^>]*>Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/999999`)).status, 404);
    assert.equal((await fetch(`${server.url}/styles.css`)).status, 200);

    const invalid = await create('   ');
    assert.match(await invalid.text(), /Project name is required/);
    assert.equal(await (await fetch(server.url)).text(), html);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.url)).text(), html);
    assert.equal(await (await fetch(`${server.url}${projectPath}`)).text(), detailHtml);
    assert.equal((await fetch(`${server.url}/health`)).status, 200);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
