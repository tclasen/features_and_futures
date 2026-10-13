import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('directory summary counts resolved matching records across filters and bulk updates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-summary-'));
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill(); await exited; child = null; }
  const post = (path, values) => fetch(base + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const task = (title, completed, priority = 'High', dueDate = '', deleted = false) => ({ title, completed, priority, dueDate, deleted, notes: 'not searched' });
  async function imported(name, archived, tasks) {
    const json = JSON.stringify({ format: 'workboard-project', version: 1, project: { name, archived, defaultPriority: 'Normal', tasks } });
    assert.equal((await post('/projects/import', { name, json })).status, 303);
  }
  function checkHtml(html, completed, total) {
    const summaries = [...html.matchAll(/data-testid="directory-summary">([^<]*)</g)];
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0][1], `${completed}/${total} completed`);
    assert.equal((html.match(/data-testid="directory-task-row"/g) || []).length, total);
    assert.equal(html.includes('No matching tasks'), total === 0);
  }
  async function check(query, completed, total) {
    checkHtml(await (await fetch(base + '/directory?' + new URLSearchParams(query))).text(), completed, total);
  }
  try {
    await start();
    await imported('First', false, [task('Match open', false, 'High', '2025-01-01'), task('Match done', true, 'High', '2025-01-02'), task('Other', true, 'Low'), task('Deleted done', true, 'High', '', true), task('Deleted open', false, 'Low', '', true)]);
    await imported('Second', false, [task('Match second', false, 'High', '2025-01-02')]);
    await imported('Archived', true, [task('Archive done', true), task('Archive open', false), task('Archive deleted', true, 'High', '', true)]);
    for (const order of ['Original', 'Priority', 'Due date', 'Title']) await check({ order }, 2, 4);
    await check({ filter: 'Open' }, 0, 2);
    await check({ filter: 'Completed' }, 2, 2);
    await check({ filter: 'Deleted' }, 1, 2);
    await check({ scope: 'Archived' }, 1, 2);
    await check({ scope: 'Archived', filter: 'Deleted' }, 1, 1);
    await check({ priorityFilter: 'Low' }, 1, 1);
    await check({ search: '  MATCH\t ' }, 1, 3);
    const values = { scope: 'Active', filter: 'All', priorityFilter: 'High', dueFrom: '2025-01-02', dueThrough: '2025-01-02', search: 'match', order: 'Title' };
    await check(values, 1, 2);
    const invalid = await post('/directory/due-range', { ...values, from: '2025-02-29', through: '' });
    assert.equal(invalid.status, 400);
    checkHtml(await invalid.text(), 1, 2);
    await check({ search: 'not searched' }, 0, 0);
    let response = await post('/directory/completion', { ...values, filter: 'Open', completed: 'true' });
    checkHtml(await (await fetch(base + response.headers.get('location'))).text(), 0, 0);
    await check(values, 2, 2);
    response = await post('/directory/completion', { ...values, filter: 'Completed', completed: 'false' });
    checkHtml(await (await fetch(base + response.headers.get('location'))).text(), 0, 0);
    await check(values, 0, 2);
    await check({}, 1, 4);
    await check({ scope: 'Archived' }, 1, 2);
    await check({ filter: 'Deleted' }, 1, 2);
    const home = await (await fetch(base + '/')).text();
    assert.match(home, /data-testid="project-summary">1\/3 completed/);
    assert.match(home, /data-testid="project-summary">0\/1 completed/);
    await stop(); await start();
    await check(values, 0, 2);
    await check({}, 1, 4);
  } finally { if (child) await stop(); await rm(directory, { recursive: true, force: true }); }
});
