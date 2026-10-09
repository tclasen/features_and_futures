import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Startup timeout')); }, 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Exited: ${code}`)); });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  };
}

test('projects validate, preserve order and identity, and survive restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(dir, 'nested', 'test.sqlite');
  let app;
  try {
    app = await start(dbPath);
    const get = path => fetch(app.url + path);
    const create = name => fetch(app.url + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let text = await (await get('/')).text();
    assert.match(text, /<h1>Workboard<\/h1>/);
    assert.match(text, /<label for="project-name">Project name<\/label>/);
    assert.match(text, />Create project<\/button>/);
    for (const name of ['', '   \t']) {
      const response = await create(name);
      text = await response.text();
      assert.match(text, /role="alert">Project name is required/);
      assert.equal((text.match(/data-testid="project-row"/g) || []).length, 0);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    text = await (await get('/')).text();
    assert.equal((text.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(text.indexOf('First project') < text.indexOf('Second &lt;project&gt;'));
    const paths = [...text.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
    assert.match(await (await get(paths[1])).text(), /<h1>Second &lt;project&gt;<\/h1>/);
    assert.match(await (await get(paths[0])).text(), />Projects<\/button>/);
    await create('  ');
    assert.equal(await (await get('/')).text(), text);
    await app.stop();
    app = await start(dbPath);
    assert.equal(await (await get('/')).text(), text);
    assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
    assert.equal((await get('/projects/999999')).status, 404);
  } finally {
    if (app) await app.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
