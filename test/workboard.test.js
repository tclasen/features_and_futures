import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); })
  };
}

test('projects validate, render safely, keep creation order and survive restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let server;
  try {
    const dbPath = join(dir, 'nested', 'projects.sqlite');
    server = await start(dbPath);
    const get = path => fetch(server.url + path);
    const create = name => fetch(server.url + '/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let content = await (await get('/')).text();
    assert.match(content, /<h1>Workboard<\/h1>/);
    assert.match(content, /<label for="project-name">Project name<\/label>/);
    assert.doesNotMatch(content, /data-testid="project-row"/);
    const invalid = await create(' \t ');
    assert.match(await invalid.text(), /role="alert">Project name is required/);
    assert.doesNotMatch(await (await get('/')).text(), /data-testid="project-row"/);
    assert.equal((await create('  Alpha <script>  ')).status, 303);
    assert.equal((await create('Beta')).status, 303);
    content = await (await get('/')).text();
    assert.equal((content.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(content, /<span>Alpha &lt;script&gt;<\/span>/);
    assert.ok(content.indexOf('Alpha') < content.indexOf('Beta'));
    const paths = [...content.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await get(paths[0])).text();
    assert.match(detail, /<h1>Alpha &lt;script&gt;<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await get('/')).text(), content);
    assert.equal(await (await get(paths[0])).text(), detail);
    assert.equal((await get('/projects/99999')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
