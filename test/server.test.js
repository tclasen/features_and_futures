import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server.js';

async function start(dbPath) {
  const server = createApplication(dbPath);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function stop(server) {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function create(url, name) {
  return fetch(`${url}/projects`, {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
}

test('project creation, validation, navigation, escaping and durable IDs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let app;
  try {
    app = await start(dbPath);
    const health = await fetch(`${app.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    let html = await (await fetch(app.url)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);

    for (const name of ['', ' \t\n ']) {
      const response = await create(app.url, name);
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    for (const name of ['  First project  ', '<script> & "Second"']) {
      const response = await create(app.url, name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    html = await (await fetch(app.url)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.ok(html.indexOf('First project') < html.indexOf('&lt;script&gt;'));
    assert.match(html, /&lt;script&gt; &amp; &quot;Second&quot;/);
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);

    await stop(app.server);
    app = await start(dbPath);
    const persistedHtml = await (await fetch(app.url)).text();
    assert.equal(persistedHtml, html);
    const detail = await fetch(`${app.url}${paths[0]}`);
    assert.equal(detail.status, 200);
    const detailHtml = await detail.text();
    assert.match(detailHtml, /<h1>First project<\/h1>/);
    assert.match(detailHtml, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${app.url}/projects/999999`)).status, 404);
    const invalid = await create(app.url, '  ');
    assert.equal(invalid.status, 400);
    assert.equal(await (await fetch(app.url)).text(), persistedHtml);
  } finally {
    if (app?.server.listening) await stop(app.server);
    await rm(directory, { recursive: true, force: true });
  }
});
