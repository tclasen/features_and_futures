import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', (chunk) => { diagnostics += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${diagnostics}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${diagnostics}`));
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
    baseUrl,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('project validation, order, navigation, escaping, and process restart persistence', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = (path) => fetch(`${running.baseUrl}${path}`);
    const create = (name) => fetch(`${running.baseUrl}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await get('/')).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    for (const name of ['', '  \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      html = await invalid.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<script>alert("hi")</script>']) {
      const created = await create(name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const beforeRestart = await (await get('/')).text();
    assert.equal((beforeRestart.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(beforeRestart, /<span>First project<\/span>/);
    assert.match(beforeRestart, /&lt;script&gt;alert\(&quot;hi&quot;\)&lt;\/script&gt;/);
    assert.ok(beforeRestart.indexOf('First project') < beforeRestart.indexOf('&lt;script&gt;'));
    const paths = [...beforeRestart.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    html = await (await get(paths[0])).text();
    assert.match(html, /<h1>First project<\/h1>/);
    assert.match(html, /action="\/"[^>]*><button type="submit">Projects<\/button>/);
    assert.equal((await get('/projects/999999')).status, 404);
    const invalid = await create('   ');
    assert.equal(( (await invalid.text()).match(/data-testid="project-row"/g) ?? []).length, 2);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await (await get('/')).text(), beforeRestart);
    assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
