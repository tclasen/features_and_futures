import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

test('launch contract, project validation, ordering, and persistence across restart', { timeout: 15000 }, async () => {
  await mkdir(resolve('data'), { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  const databasePath = resolve(directory, 'projects.sqlite');
  let child;
  let base;

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: databasePath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      let output = '';
      let errors = '';
      child.stderr.on('data', (chunk) => { errors += chunk; });
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Server exited: ${code}\n${errors}`)));
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) {
          base = `http://127.0.0.1:${match[1]}`;
          resolve();
        }
      });
    });
  }

  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }

  try {
    await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<title>Workboard<\/title>/);
    for (const asset of ['/app.js', '/style.css']) {
      assert.equal((await fetch(`${base}${asset}`)).status, 200);
    }
    const list = async () => (await fetch(`${base}/api/projects`)).json();
    const create = (name) => fetch(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    assert.deepEqual(await list(), []);
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await list(), []);
    }
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script> & Second')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await list(), [first, second]);
    const detail = await fetch(`${base}/api/projects/${first.id}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), first);
    const page = await fetch(`${base}/projects/${first.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /src="\/app.js"/);
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    await stop();
    await start();
    assert.deepEqual(await list(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
    assert.deepEqual(await list(), [first, second, third]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
