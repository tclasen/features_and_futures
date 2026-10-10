import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${stderr}`));
    }, 5000);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${stderr}`));
    });
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

async function createProject(url, name) {
  return fetch(`${url}/projects`, {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
}

function rows(html) {
  return [...html.matchAll(/<li data-testid="project-row">([\s\S]*?)<\/li>/g)]
    .map((match) => ({
      name: /<span>(.*?)<\/span>/.exec(match[1])[1],
      path: /action="([^"]+)"/.exec(match[1])[1],
    }));
}

test('projects validate, navigate, escape HTML, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let app;
  try {
    app = await start(databasePath);
    const health = await fetch(`${app.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(app.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.deepEqual(rows(initial), []);

    for (const name of ['', ' \t\n ']) {
      const invalid = await createProject(app.url, name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.deepEqual(rows(html), []);
    }

    for (const name of ['  First project  ', '<script>alert("x")</script> & Second']) {
      const response = await createProject(app.url, name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const savedRows = rows(await (await fetch(app.url)).text());
    assert.deepEqual(savedRows.map((row) => row.name), [
      'First project', '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Second',
    ]);
    assert.notEqual(savedRows[0].path, savedRows[1].path);
    const detail = await (await fetch(`${app.url}${savedRows[0].path}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<form action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${app.url}/projects/99999`)).status, 404);

    const invalid = await createProject(app.url, '   ');
    assert.deepEqual(rows(await invalid.text()), savedRows);
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(rows(await (await fetch(app.url)).text()), savedRows);
    const persistedDetail = await fetch(`${app.url}${savedRows[0].path}`);
    assert.equal(persistedDetail.status, 200);
    assert.match(await persistedDetail.text(), /<h1>First project<\/h1>/);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
