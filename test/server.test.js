import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('projects validate, retain creation order, and persist across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  let child;
  let base;
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  // Use a dynamically imported server and report its listening port via node:http.
  async function launch() {
    const script = `import http from 'node:http';
      const listen = http.Server.prototype.listen;
      http.Server.prototype.listen = function (...args) {
        this.once('listening', () => console.log(this.address().port));
        return listen.apply(this, args);
      };
      await import('./server.js');`;
    child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, DB_PATH: join(dir, 'projects.sqlite'), PORT: '0' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const [chunk] = await once(child.stdout, 'data');
    base = 'http://127.0.0.1:' + chunk.toString().trim();
  }
  async function create(name) {
    return fetch(base + '/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
  }
  try {
    await launch();
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.equal((await create('   ')).status, 400);
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), []);
    const first = await (await create('  Alpha  ')).json();
    const second = await (await create('Beta')).json();
    assert.equal(first.name, 'Alpha');
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), [first, second]);
    assert.equal((await fetch(base + '/projects/' + first.id)).status, 200);
    await stop();
    await launch();
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await fetch(base + '/api/projects/' + first.id)).json(), first);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
