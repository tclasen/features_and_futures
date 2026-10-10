import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';

test('project creation, validation, navigation, and restart persistence', async (t) => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(join(process.cwd(), 'data', 'test-'));
  let child;
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  t.after(async () => {
    await stop();
    await rm(directory, { recursive: true, force: true });
  });
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server did not start')), 5000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', (chunk) => {
        const match = /listening on port (\d+)/.exec(chunk.toString());
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    return `http://127.0.0.1:${port}`;
  }
  let base = await start();
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const initial = await (await fetch(base)).text();
  assert.match(initial, /<h1>Workboard<\/h1>/);
  assert.match(initial, /<label for="project-name">Project name<\/label>/);
  assert.match(initial, />Create project<\/button>/);

  async function create(name) {
    return fetch(`${base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
  }
  for (const name of ['', ' \t\n ']) {
    const response = await create(name);
    assert.equal(response.status, 400);
    const html = await response.text();
    assert.match(html, /role="alert">Project name is required/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
  }
  assert.equal((await create('  First project  ')).status, 303);
  assert.equal((await create('Second <project> & "team"')).status, 303);
  const list = await (await fetch(base)).text();
  assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
  assert.match(list, />First project<\/span>/);
  assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
  assert.match(list, /Second &lt;project&gt; &amp; &quot;team&quot;/);
  const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
  assert.equal(paths.length, 2);
  assert.notEqual(paths[0], paths[1]);
  const detail = await (await fetch(`${base}${paths[0]}`)).text();
  assert.match(detail, /<h1>First project<\/h1>/);
  assert.match(detail, /action="\/".*>Projects<\/button>/);
  const invalid = await create('   ');
  const invalidHtml = await invalid.text();
  assert.equal((invalidHtml.match(/data-testid="project-row"/g) || []).length, 2);
  assert.equal(await (await fetch(base)).text(), list);
  assert.equal((await fetch(`${base}/projects/99999`)).status, 404);

  await stop();
  base = await start();
  assert.equal(await (await fetch(base)).text(), list);
  assert.equal(await (await fetch(`${base}${paths[0]}`)).text(), detail);
});
