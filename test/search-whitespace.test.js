import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('search collapses ASCII spaces and tabs without changing persistent text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-whitespace-'));
  let child, base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(dir, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'inherit']
    });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  };
  const stop = async () => { const exit = once(child, 'exit'); child.kill(); await exit; };
  const post = (path, data) => fetch(base + path, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual' });
  const html = async (path, query = '') => (await fetch(base + path + '?' + new URLSearchParams({ search: query }))).text();
  const names = ['MiXeD \t  Team', 'Mixed Team', 'Mixed\nTeam', 'Mixed\u00a0Team'];
  try {
    await start();
    for (const name of names) await post('/projects', { name });
    for (const title of names) await post('/projects/1/tasks', { title });
    const check = async () => {
      for (const query of ['mixed team', ' \t MIXED\t \tTEAM \n', 'mixed  team']) {
        const projects = await html('/', query);
        const tasks = await html('/projects/1', query);
        assert.equal((projects.match(/data-testid="project-row"/g) || []).length, 2);
        assert.equal((tasks.match(/data-testid="task-row"/g) || []).length, 2);
        assert.ok(projects.includes(names[0]));
        assert.ok(tasks.includes(`aria-label="Complete ${names[0]}"`));
      }
      for (const path of ['/', '/projects/1']) {
        const text = await html(path);
        for (const name of names) assert.ok(text.includes(name));
      }
    };
    await check();
    await stop();
    await start();
    await check();
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
