import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
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
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  return {
    base: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render safely, navigate, and persist across restarts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let app;
  t.after(async () => {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  });
  app = await start(dbPath);
  const get = (path) => fetch(app.base + path);
  const create = (name) => fetch(app.base + '/projects', {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
  let response = await get('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  let body = await (await get('/')).text();
  assert.match(body, /<h1>Workboard<\/h1>/);
  assert.match(body, /<label for="project-name">Project name<\/label>/);
  assert.match(body, />Create project<\/button>/);
  assert.doesNotMatch(body, /data-testid="project-row"/);
  for (const name of ['', ' \t\n ']) {
    response = await create(name);
    assert.equal(response.status, 422);
    body = await response.text();
    assert.match(body, /role="alert">Project name is required/);
    assert.doesNotMatch(body, /data-testid="project-row"/);
  }
  for (const name of ['  First project  ', '<script>alert("x")</script>']) {
    response = await create(name);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/');
  }
  body = await (await get('/')).text();
  assert.equal((body.match(/data-testid="project-row"/g) || []).length, 2);
  assert.match(body, /<span>First project<\/span>/);
  assert.match(body, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.ok(body.indexOf('First project') < body.indexOf('&lt;script&gt;'));
  const paths = [...body.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
  assert.equal(paths.length, 2);
  assert.notEqual(paths[0], paths[1]);
  const detail = await (await get(paths[0])).text();
  assert.match(detail, /<h1>First project<\/h1>/);
  assert.match(detail, /action="\/"/);
  assert.match(detail, />Projects<\/button>/);
  assert.equal((await get('/projects/99999')).status, 404);
  assert.equal((await get('/missing')).status, 404);
  await app.stop();
  app = undefined;
  app = await start(dbPath);
  assert.equal(await (await get('/')).text(), body);
  assert.equal(await (await get(paths[0])).text(), detail);
  await create('Third');
  const updated = await (await get('/')).text();
  assert.equal((updated.match(/data-testid="project-row"/g) || []).length, 3);
  assert.ok(updated.indexOf('Third') > updated.indexOf('&lt;script&gt;'));
});
