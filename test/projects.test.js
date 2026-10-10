import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${output}`));
    }, 5000);
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => {
      output += data;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${output}`));
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

test('projects validate, trim, preserve order, navigate, and survive a restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<button type="submit">Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    async function create(name) {
      return fetch(`${server.url}/projects`, {
        method: 'POST',
        body: new URLSearchParams({ name }),
        redirect: 'manual',
      });
    }
    for (const name of ['', ' \t\n ']) {
      const result = await create(name);
      assert.equal(result.status, 400);
      const html = await result.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    const first = await create('  Launch <plan> & review  ');
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/');
    assert.equal((await create('Second project')).status, 303);
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /class="project-name">Launch &lt;plan&gt; &amp; review<\/span>/);
    assert.ok(list.indexOf('Launch &lt;plan&gt;') < list.indexOf('Second project'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const project = await (await fetch(`${server.url}${paths[0]}`)).text();
    assert.match(project, /<h1>Launch &lt;plan&gt; &amp; review<\/h1>/);
    assert.match(project, /action="\/">\s*<button type="submit">Projects<\/button>/);

    const invalid = await create('   ');
    assert.equal((await invalid.text()).match(/data-testid="project-row"/g).length, 2);
    assert.equal(await (await fetch(server.url)).text(), list);
    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await (await fetch(server.url)).text(), list);
    assert.equal(await (await fetch(`${server.url}${paths[0]}`)).text(), project);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
