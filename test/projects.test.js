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
  const baseUrl = await new Promise((resolve, reject) => {
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
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render safely, keep creation order and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    let page = await (await fetch(server.baseUrl)).text();
    assert.match(page, /<h1>Workboard<\/h1>/);
    assert.match(page, /<label for="project-name">Project name<\/label>/);
    assert.match(page, /<button type="submit">Create project<\/button>/);
    assert.doesNotMatch(page, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.baseUrl}/projects`, {
        method: 'POST',
        body: new URLSearchParams({ name }),
        redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    assert.equal((await create('Second <script> & café')).status, 303);

    page = await (await fetch(server.baseUrl)).text();
    assert.equal((page.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(page, /<span>First project<\/span>/);
    assert.match(page, /Second &lt;script&gt; &amp; café/);
    assert.ok(page.indexOf('First project') < page.indexOf('Second &lt;script&gt;'));
    const paths = [...page.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(`${server.baseUrl}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.baseUrl}/projects/999999`)).status, 404);

    const invalid = await create('   ');
    assert.equal(((await invalid.text()).match(/data-testid="project-row"/g) ?? []).length, 2);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.baseUrl)).text(), page);
    assert.match(await (await fetch(`${server.baseUrl}${paths[0]}`)).text(), /<h1>First project<\/h1>/);
    await create('Third project');
    const restartedPage = await (await fetch(server.baseUrl)).text();
    assert.equal((restartedPage.match(/data-testid="project-row"/g) ?? []).length, 3);
    assert.ok(restartedPage.indexOf('Third project') > restartedPage.indexOf('Second &lt;script&gt;'));
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
