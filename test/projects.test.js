import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function startServer(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
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

test('projects validate, navigate, and persist in creation order', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  t.after(async () => {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  });
  server = await startServer(dbPath);
  const get = path => fetch(server.baseUrl + path);
  const create = name => fetch(server.baseUrl + '/projects', {
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
  assert.match(initial, /id="project-name" name="name" type="text"/);
  assert.match(initial, /<button type="submit">Create project<\/button>/);
  assert.doesNotMatch(initial, /data-testid="project-row"/);

  for (const name of ['', '   \t  ']) {
    const invalid = await create(name);
    assert.equal(invalid.status, 400);
    const html = await invalid.text();
    assert.match(html, /role="alert">Project name is required/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
  }
  for (const name of ['  First project  ', 'Second <project> & "more"']) {
    const created = await create(name);
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
  }
  const list = await (await get('/')).text();
  assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
  assert.match(list, /<span>First project<\/span>/);
  assert.match(list, /Second &lt;project&gt; &amp; &quot;more&quot;/);
  assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
  const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
  assert.equal(paths.length, 2);
  for (const [index, path] of paths.entries()) {
    const detail = await get(path);
    assert.equal(detail.status, 200);
    const html = await detail.text();
    assert.match(html, index === 0 ? /<h1>First project<\/h1>/ : /<h1>Second &lt;project&gt; &amp; &quot;more&quot;<\/h1>/);
    assert.match(html, /action="\/".*<button type="submit">Projects<\/button>/);
  }
  const invalidAfterCreation = await (await create(' ')).text();
  assert.equal((invalidAfterCreation.match(/data-testid="project-row"/g) || []).length, 2);
  assert.equal(await (await get('/')).text(), list);
  await server.stop();
  server = undefined;
  server = await startServer(dbPath);
  assert.equal(await (await get('/')).text(), list);
  assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
  assert.equal((await get('/projects/999999')).status, 404);
});
