import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited (${code}): ${stderr}`)));
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

async function create(baseUrl, name) {
  return fetch(`${baseUrl}/projects`, {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
}

function projectRows(html) {
  return [...html.matchAll(/<li data-testid="project-row">([\s\S]*?)<\/li>/g)].map((match) => ({
    name: match[1].match(/<span>(.*?)<\/span>/s)[1],
    path: match[1].match(/action="(.*?)"/)[1],
  }));
}

test('projects validate, render safely, retain order and persist after restart', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    let html = await (await fetch(server.baseUrl)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.deepEqual(projectRows(html), []);

    for (const name of ['', '  \t\n  ']) {
      const invalid = await create(server.baseUrl, name);
      assert.equal(invalid.status, 400);
      const invalidHtml = await invalid.text();
      assert.match(invalidHtml, /role="alert">Project name is required/);
      assert.deepEqual(projectRows(invalidHtml), []);
    }

    for (const name of ['  First project  ', '<script>alert("x")</script>', 'First project']) {
      const result = await create(server.baseUrl, name);
      assert.equal(result.status, 303);
      assert.equal(result.headers.get('location'), '/');
    }
    html = await (await fetch(server.baseUrl)).text();
    const rows = projectRows(html);
    assert.deepEqual(rows.map((row) => row.name), [
      'First project', '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;', 'First project',
    ]);
    assert.equal(new Set(rows.map((row) => row.path)).size, 3);
    assert.match(html, />Open project<\/button>/);
    for (const row of rows) {
      const detail = await fetch(`${server.baseUrl}${row.path}`);
      assert.equal(detail.status, 200);
      const detailHtml = await detail.text();
      assert.ok(detailHtml.includes(`<h1>${row.name}</h1>`));
      assert.match(detailHtml, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    }
    assert.equal((await fetch(`${server.baseUrl}/projects/99999`)).status, 404);
    const invalid = await create(server.baseUrl, '   ');
    assert.deepEqual(projectRows(await invalid.text()), rows);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    const persisted = await (await fetch(server.baseUrl)).text();
    assert.deepEqual(projectRows(persisted), rows);
    for (const row of rows) {
      assert.equal((await fetch(`${server.baseUrl}${row.path}`)).status, 200);
    }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
