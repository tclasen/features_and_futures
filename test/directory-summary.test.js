import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('directory summary counts the resolved intersection without changing saved data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-summary-'));
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.on('error', reject);
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  }
  async function stop() { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; child = null; }
  const post = (path, body) => fetch(base + path, { method: 'POST', body: new URLSearchParams(body), redirect: 'manual' });
  const task = (title, completed, priority = 'High', dueDate = '2024-02-29', deleted = false) => ({ title, completed, priority, dueDate, deleted, notes: 'literal notes' });
  async function imported(name, archived, tasks) {
    await post('/projects/import', { name, json: JSON.stringify({ format: 'workboard-project', version: 1, project: { name, archived, defaultPriority: 'Normal', tasks } }) });
  }
  async function check(fields, expected) {
    const html = await (await fetch(base + '/directory?' + new URLSearchParams(fields))).text();
    const summaries = [...html.matchAll(/data-testid="directory-summary">([^<]*)<\/p>/g)];
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0][1], expected);
    const rows = [...html.matchAll(/data-testid="directory-task-row"/g)].length;
    assert.equal(rows, Number(expected.split('/')[1].split(' ')[0]));
    assert.equal(html.includes('No matching tasks'), rows === 0);
    return html;
  }
  const exported = async id => (await fetch(base + `/projects/${id}/download`)).json();
  try {
    await start();
    await imported('First', false, [task('Match one', false), task('Match two', true), task('Other', true, 'Low', ''), task('Match deleted', true, 'High', '2024-02-29', true)]);
    await imported('Second', false, [task('MATCH\t three', false), task('Match late', true, 'High', '2025-01-01')]);
    await imported('Archived', true, [task('Match archived', true), task('Open archived', false), task('Deleted archived', false, 'High', '', true)]);
    const before = await Promise.all([1, 2, 3].map(exported));
    await check({}, '3/5 completed');
    await check({ filter: 'Open' }, '0/2 completed');
    await check({ filter: 'Completed' }, '3/3 completed');
    await check({ filter: 'Deleted' }, '1/1 completed');
    await check({ scope: 'Archived' }, '1/2 completed');
    await check({ scope: 'Archived', filter: 'Deleted' }, '0/1 completed');
    const fields = { priorityFilter: 'High', search: '  match  ', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    for (const order of ['Original', 'Priority', 'Due date', 'Title']) await check({ ...fields, order }, '1/3 completed');
    await check({ search: 'literal notes' }, '0/0 completed');
    assert.deepEqual(await Promise.all([1, 2, 3].map(exported)), before);
    const invalid = await (await fetch(base + '/directory/due-range?' + new URLSearchParams({ ...fields, appliedFrom: fields.dueFrom, appliedThrough: fields.dueThrough, dueFrom: '2024-02-30' }))).text();
    assert.match(invalid, /Due range must use valid/);
    assert.match(invalid, /data-testid="directory-summary">1\/3 completed/);
    const bulk = { ...fields, filter: 'Open', order: 'Title' };
    await post('/directory/complete', bulk);
    await check(bulk, '0/0 completed');
    await check(fields, '3/3 completed');
    await check({ filter: 'Deleted' }, '1/1 completed');
    await check({ scope: 'Archived' }, '1/2 completed');
    await post('/directory/reopen', { ...fields, filter: 'Completed', order: 'Priority' });
    await check({ ...fields, filter: 'Completed', order: 'Priority' }, '0/0 completed');
    await check(fields, '0/3 completed');
    await stop();
    await start();
    await check(fields, '0/3 completed');
    await check({}, '2/5 completed');
    const home = await (await fetch(base)).text();
    assert.match(home, /data-testid="project-summary">1\/3 completed/);
    assert.match(home, /data-testid="project-summary">1\/2 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
