import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('project creation, validation, navigation, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
      child.stdout.on('data', chunk => {
        output += chunk;
        const port = output.match(/listening on port (\d+)/);
        if (port) { base = `http://127.0.0.1:${port[1]}`; resolve(); }
      });
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  const get = path => fetch(`${base}${path}`);
  const create = name => fetch(`${base}/projects`, {
    method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
  });
  try {
    await start();
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<button type="submit">Create project<\/button>/);
    for (const name of ['', '  \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.match(await invalid.text(), /role="alert">Project name is required/);
    }
    assert.doesNotMatch(await (await get('/')).text(), /data-testid="project-row"/);
    for (const name of ['  Alpha  ', 'Beta <script> & "test"']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const listing = await (await get('/')).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /class="project-name">Alpha<\/span>/);
    assert.ok(listing.indexOf('>Alpha</span>') < listing.indexOf('>Beta &lt;script&gt;'));
    assert.match(listing, /Beta &lt;script&gt; &amp; &quot;test&quot;/);
    assert.match(listing, /action="\/projects\/1"/);
    const detail = await (await get('/projects/1')).text();
    assert.match(detail, /<h1>Alpha<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await get('/projects/999')).status, 404);
    await stop();
    await start();
    assert.equal(await (await get('/')).text(), listing);
    assert.equal(await (await get('/projects/1')).text(), detail);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
