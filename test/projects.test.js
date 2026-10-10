import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const port = await new Promise((resolvePort, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) resolvePort(match[1]);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited ${code}: ${errors}`)));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, trim, keep order, navigate, and survive server restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp('data/test-');
  const dbPath = resolve(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = path => fetch(server.url + path);
    const create = name => fetch(server.url + '/projects', {
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
    for (const blank of ['', '  \t\n ']) {
      const response = await create(blank);
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', 'Second project', '<script>alert("hello")</script> 🧩']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const list = await (await get('/')).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 3);
    assert.match(list, />First project<\/span>/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second project'));
    assert.match(list, /&lt;script&gt;alert\(&quot;hello&quot;\)&lt;\/script&gt; 🧩/);
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 3);
    const detail = await (await get(paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await get('/projects/99999')).status, 404);
    assert.equal(await (await get('/')).text(), list);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await get('/')).text(), list);
    assert.equal(await (await get(paths[0])).text(), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
