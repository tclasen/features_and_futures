import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
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

async function createProject(baseUrl, name) {
  return fetch(`${baseUrl}/projects`, {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
}

function rows(html) {
  return [...html.matchAll(/<li data-testid="project-row">(.*?)<\/li>/gs)].map((match) => match[1]);
}

test('projects validate, navigate, and persist through a server process restart', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.baseUrl)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<input id="project-name" name="name" type="text"/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal(rows(initial).length, 0);

    for (const name of ['', '  \t\n  ']) {
      const invalid = await createProject(server.baseUrl, name);
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.equal(rows(html).length, 0);
    }

    for (const name of ['  First project  ', '<script>alert("test")</script> & second']) {
      const created = await createProject(server.baseUrl, name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const list = await (await fetch(server.baseUrl)).text();
    const projectRows = rows(list);
    assert.equal(projectRows.length, 2);
    assert.match(projectRows[0], /<span class="name">First project<\/span>/);
    assert.match(projectRows[1], /&lt;script&gt;alert\(&quot;test&quot;\)&lt;\/script&gt; &amp; second/);
    const projectPaths = projectRows.map((row) => {
      assert.match(row, />Open project<\/button>/);
      return row.match(/action="(\/projects\/\d+)"/)[1];
    });
    assert.notEqual(projectPaths[0], projectPaths[1]);
    const detail = await (await fetch(server.baseUrl + projectPaths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<form action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.baseUrl}/projects/999999`)).status, 404);

    const invalidWithProjects = await createProject(server.baseUrl, ' ');
    assert.deepEqual(rows(await invalidWithProjects.text()), projectRows);
    assert.deepEqual(rows(await (await fetch(server.baseUrl)).text()), projectRows);

    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(rows(await (await fetch(server.baseUrl)).text()), projectRows);
    for (const path of projectPaths) {
      assert.equal((await fetch(server.baseUrl + path)).status, 200);
    }
    assert.equal((await createProject(server.baseUrl, 'Third project')).status, 303);
    const afterRestart = rows(await (await fetch(server.baseUrl)).text());
    assert.equal(afterRestart.length, 3);
    assert.deepEqual(afterRestart.slice(0, 2), projectRows);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
