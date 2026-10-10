import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return { base, async stop() { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; } };
}

test('projects validate, render in order, navigate, and survive a restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(dir, 'nested', 'db.sqlite');
    server = await start(dbPath);
    const get = path => fetch(server.base + path);
    const create = name => fetch(server.base + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await get('/')).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    const invalid = await create('   ');
    html = await invalid.text();
    assert.match(html, /role="alert">Project name is required/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    assert.equal((await create('  First & <project>  ')).status, 303);
    assert.equal((await create('Second')).status, 303);
    html = await (await get('/')).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(html.indexOf('First &amp; &lt;project&gt;') < html.indexOf('Second'));
    const ids = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(ids.length, 2);
    const detail = await (await get(ids[0])).text();
    assert.match(detail, /<h1>First &amp; &lt;project&gt;<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    await server.stop();
    server = await start(dbPath);
    const restarted = await (await get('/')).text();
    assert.equal(restarted, html);
    assert.equal(await (await get(ids[0])).text(), detail);
    assert.equal((await get('/projects/99999')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
