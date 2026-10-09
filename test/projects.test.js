import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}): ${errors}`));
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
    url,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, preserve names and IDs, and survive a server restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  t.after(async () => {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  });
  server = await startServer(databasePath);
  const get = (path) => fetch(`${server.url}${path}`);
  const create = (name) => fetch(`${server.url}/projects`, {
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
  assert.match(initial, />Create project<\/button>/);
  assert.doesNotMatch(initial, /data-testid="project-row"/);

  for (const name of ['', '  \t\n ']) {
    const invalid = await create(name);
    assert.equal(invalid.status, 422);
    const body = await invalid.text();
    assert.match(body, /role="alert">Project name is required/);
    assert.doesNotMatch(body, /data-testid="project-row"/);
  }

  const created = await create('  First project  ');
  assert.equal(created.status, 303);
  assert.equal(created.headers.get('location'), '/');
  await created.text();
  const second = await create('<script>alert("x")</script> & next');
  assert.equal(second.status, 303);
  await second.text();

  const list = await (await get('/')).text();
  assert.equal([...list.matchAll(/data-testid="project-row"/g)].length, 2);
  assert.match(list, /<span>First project<\/span>/);
  assert.match(list, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; next/);
  assert.doesNotMatch(list, /<script>/);
  const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
  assert.equal(paths.length, 2);
  assert.notEqual(paths[0], paths[1]);
  assert.ok(list.indexOf('First project') < list.indexOf('&lt;script&gt;'));
  const detail = await (await get(paths[0])).text();
  assert.match(detail, /<h1>First project<\/h1>/);
  assert.match(detail, /action="\/".*>Projects<\/button>/);
  assert.equal((await get('/projects/999999')).status, 404);
  assert.equal((await get('/projects/9007199254740993')).status, 404);

  const invalidAfterCreation = await create('   ');
  assert.equal(invalidAfterCreation.status, 422);
  assert.match(await invalidAfterCreation.text(), /role="alert">Project name is required/);
  assert.equal(await (await get('/')).text(), list);
  await server.stop();
  server = await startServer(databasePath);
  assert.equal(await (await get('/')).text(), list);
  assert.equal(await (await get(paths[0])).text(), detail);
});
