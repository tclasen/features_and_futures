import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: resolve('.'),
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const baseUrl = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /http:\/\/0\.0\.0\.0:(\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolveUrl(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const [code] = await exited;
      assert.equal(code, 0, errors);
    },
  };
}

test('projects validate, render safely, retain creation order, and survive restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const databasePath = join(directory, 'projects.sqlite');
    server = await startServer(databasePath);
    const get = (path) => fetch(`${server.baseUrl}${path}`);
    const create = (name) => fetch(`${server.baseUrl}/projects`, {
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
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const name of ['', '   \t\n']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    for (const name of ['  First project  ', 'Second <script> & café']) {
      const created = await create(name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
      await created.text();
    }
    const listing = await (await get('/')).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span>First project<\/span>/);
    assert.match(listing, /Second &lt;script&gt; &amp; café/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.equal(new Set(paths).size, 2);
    assert.equal((listing.match(/>Open project<\/button>/g) || []).length, 2);

    const detail = await (await get(paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    const invalidAfterCreation = await create(' ');
    assert.equal(invalidAfterCreation.status, 422);
    assert.equal(((await invalidAfterCreation.text()).match(/data-testid="project-row"/g) || []).length, 2);
    assert.equal(await (await get('/')).text(), listing);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await get('/')).text(), listing);
    assert.equal(await (await get(paths[0])).text(), detail);
    assert.match(await (await get(paths[1])).text(), /<h1>Second &lt;script&gt; &amp; café<\/h1>/);
    assert.equal((await get('/projects/99999')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
