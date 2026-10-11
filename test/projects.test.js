import { test } from 'node:test';
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
  const base = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return { child, base };
}

async function stop(child) {
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

test('projects validate, escape, preserve order and survive server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let running;
  try {
    running = await start(join(directory, 'projects.sqlite'));
    let { base } = running;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);
    const create = name => fetch(`${base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', '   \t  ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <script> & café')).status, 303);
    const listing = await (await fetch(base)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, />First project<\/span>/);
    assert.match(listing, /Second &lt;script&gt; &amp; café/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    const detail = await (await fetch(`${base}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/">.*>Projects<\/button>/);
    assert.equal((await fetch(`${base}/projects/9999`)).status, 404);
    await stop(running.child);
    running = undefined;
    running = await start(join(directory, 'projects.sqlite'));
    base = running.base;
    assert.equal(await (await fetch(base)).text(), listing);
    assert.match(await (await fetch(`${base}${paths[0]}`)).text(), /<h1>First project<\/h1>/);
  } finally {
    if (running) await stop(running.child);
    await rm(directory, { recursive: true, force: true });
  }
});
