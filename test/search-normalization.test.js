import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('search collapses only ASCII spaces/tabs without changing persisted names or titles', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-normalization-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Server exited')));
      child.stdout.on('data', (data) => {
        const port = String(data).match(/port (\d+)/);
        if (port) resolve(`http://127.0.0.1:${port[1]}`);
      });
    });
  }
  async function stop() {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  try {
    let base = await start();
    const post = (path, data) => fetch(base + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const get = async (path, search = '') => (await fetch(base + path + '?' + new URLSearchParams({ search }))).text();
    const projectNames = (html) => [...html.matchAll(/data-testid="project-row">\s*<span>([^<]+)<\/span>/g)].map((m) => m[1]);
    const titles = (html) => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map((m) => m[1]);
    const names = ['MiXeD \t  Team', 'Mixed Team', 'Mixed\nTeam', 'Mixed\u00a0Team'];
    for (const name of names) await post('/projects', { name });
    for (const title of names) await post('/projects/1/tasks', { title });
    for (let pass = 0; pass < 2; pass++) {
      for (const query of ['mixed team', '\t MIXED\t \tTEAM \n', 'xed\t  te']) {
        assert.deepEqual(projectNames(await get('/', query)), names.slice(0, 2));
        assert.deepEqual(titles(await get('/projects/1', query)), names.slice(0, 2));
      }
      // Newlines and non-ASCII spaces inside saved strings are not collapsed.
      for (const query of names.slice(2)) {
        assert.deepEqual(projectNames(await get('/', query)), [query]);
        assert.deepEqual(titles(await get('/projects/1', query)), [query]);
      }
      assert.deepEqual(projectNames(await get('/')), names);
      assert.deepEqual(titles(await get('/projects/1', '\t \n')), names);
      if (pass === 0) {
        await stop();
        base = await start();
      }
    }
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
