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
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Startup timed out: ${errors}`));
    }, 5000);
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    base,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  };
}

test('project validation, ordering, navigation, escaping and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const getList = () => fetch(`${server.base}/`).then(response => response.text());
    const create = name => fetch(`${server.base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    let list = await getList();
    assert.match(list, /<h1>Workboard<\/h1>/);
    assert.match(list, /<label for="project-name">Project name<\/label>/);
    assert.match(list, />Create project<\/button>/);
    assert.doesNotMatch(list, /data-testid="project-row"/);
    for (const name of ['', '  \t  ']) {
      const response = await create(name);
      assert.equal(response.status, 422);
      assert.match(await response.text(), /role="alert">Project name is required/);
    }
    assert.doesNotMatch(await getList(), /data-testid="project-row"/);
    for (const name of ['  First project  ', '<Second & project>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    list = await getList();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /<span>&lt;Second &amp; project&gt;<\/span>/);
    assert.ok(list.indexOf('First project') < list.indexOf('&lt;Second'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await fetch(`${server.base}${paths[0]}`).then(response => response.text());
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.base}/projects/99999`)).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await getList(), list);
    assert.equal(await fetch(`${server.base}${paths[0]}`).then(response => response.text()), detail);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
