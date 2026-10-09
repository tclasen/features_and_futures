import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repository = fileURLToPath(new URL('../', import.meta.url));

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: repository,
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const address = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${stderr}`));
    }, 5000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${stderr}`));
    });
    child.stdout.on('data', (chunk) => {
      const match = /listening on port (\d+)/.exec(String(chunk));
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    address,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const [code] = await exited;
      assert.equal(code, 0, stderr);
    },
  };
}

test('projects validate, render safely, navigate, and persist across restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = (path) => fetch(`${server.address}${path}`);
    const create = (name) => fetch(`${server.address}/`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });

    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<button type="submit">Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const blank of ['', ' \t\n ']) {
      const response = await create(blank);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    const first = await create('  First project  ');
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/');
    assert.equal((await create('<script>alert("hello")</script> & second')).status, 303);
    const list = await (await get('/')).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span class="project-name">First project<\/span>/);
    assert.match(list, /&lt;script&gt;alert\(&quot;hello&quot;\)&lt;\/script&gt; &amp; second/);
    assert.doesNotMatch(list, /<script>/);
    assert.ok(list.indexOf('First project') < list.indexOf('&lt;script&gt;'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const opened = await get(paths[0]);
    assert.equal(opened.status, 200);
    const projectHtml = await opened.text();
    assert.match(projectHtml, /<h1>First project<\/h1>/);
    assert.match(projectHtml, /<form action="\/" method="get"><button type="submit">Projects<\/button>/);

    const blankWithProjects = await create('   ');
    assert.equal(((await blankWithProjects.text()).match(/data-testid="project-row"/g) || []).length, 2);
    assert.equal((await get('/projects/999999')).status, 404);

    await server.stop();
    server = await startServer(databasePath);
    const restored = await (await get('/')).text();
    assert.equal(restored, list);
    assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
    assert.equal((await create('Third project')).status, 303);
    assert.equal(((await (await get('/')).text()).match(/data-testid="project-row"/g) || []).length, 3);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
