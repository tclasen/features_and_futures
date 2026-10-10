import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('project validation, navigation, ordering, and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let child;
  let baseUrl;

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    baseUrl = await new Promise((resolve, reject) => {
      let output = '';
      let errors = '';
      const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.stderr.on('data', chunk => { errors += chunk; });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => {
        clearTimeout(timeout);
        reject(new Error(`Server exited with ${code}: ${errors}`));
      });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = /listening on port (\d+)/.exec(output);
        if (match) {
          clearTimeout(timeout);
          resolve(`http://127.0.0.1:${match[1]}`);
        }
      });
    });
  }

  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }

  async function create(name) {
    return fetch(`${baseUrl}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
  }

  try {
    await start();
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(baseUrl)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<button type="submit">Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const name of ['', '   \t\n']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    await create('Second <project> & "team"');
    const listing = await (await fetch(baseUrl)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span>First project<\/span>/);
    assert.match(listing, /Second &lt;project&gt; &amp; &quot;team&quot;/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;project&gt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);

    const detail = await (await fetch(`${baseUrl}${paths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*<button type="submit">Projects<\/button>/);
    const rejectedAfterCreation = await create('  ');
    assert.equal((await rejectedAfterCreation.text()).match(/data-testid="project-row"/g).length, 2);
    assert.equal(await (await fetch(baseUrl)).text(), listing);

    await stop();
    await start();
    assert.equal(await (await fetch(baseUrl)).text(), listing);
    assert.equal(await (await fetch(`${baseUrl}${paths[0]}`)).text(), detail);
    assert.equal((await fetch(`${baseUrl}/projects/999999`)).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
