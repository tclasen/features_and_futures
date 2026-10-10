import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('projects validate, render safely, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  let child;
  let diagnostics = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', chunk => { diagnostics += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(diagnostics);
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    throw new Error(`Server did not start: ${diagnostics}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function create(name) {
    return fetch(`${base}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
  }
  try {
    await start();
    let html = await (await fetch(base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);
    for (const blank of ['', '   \t\n']) {
      const invalid = await create(blank);
      assert.equal(invalid.status, 400);
      html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  Alpha  ')).status, 303);
    assert.equal((await create('<Beta & "friends">')).status, 303);
    html = await (await fetch(base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>Alpha<\/span>/);
    assert.match(html, /&lt;Beta &amp; &quot;friends&quot;&gt;/);
    assert.ok(html.indexOf('<span>Alpha') < html.indexOf('<span>&lt;Beta'));
    const paths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    const detail = await (await fetch(base + paths[0])).text();
    assert.match(detail, /<h1>Alpha<\/h1>/);
    assert.match(detail, /action="\/".*><button type="submit">Projects<\/button>/);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), html);
    assert.equal(await (await fetch(base + paths[0])).text(), detail);
    assert.equal((await fetch(`${base}/projects/99999`)).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
