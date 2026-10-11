import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('directory summary counts only resolved matches across scopes, filters, order and bulk actions', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'workboard-summary-'));
  let child;
  try {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(temp, 'db.sqlite') }, stdio: ['ignore', 'pipe', 'pipe']
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(match[1]);
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
    const base = `http://127.0.0.1:${port}`;
    const get = async path => (await fetch(base + path)).text();
    const post = async (path, values) => (await fetch(base + path, { method: 'POST', body: new URLSearchParams(values) })).text();
    const task = (title, completed, priority, dueDate, deleted = false) => ({ title, completed, priority, dueDate, deleted, notes: 'Literal <notes>' });
    for (const [index, archived] of [false, false, true].entries()) {
      await post('/projects/import', { importedName: `Owner ${index}`, projectJson: JSON.stringify({
        format: 'workboard-project', version: 1, project: { name: 'Portable', archived, defaultPriority: 'Normal', tasks: [
          task('Match A', false, 'High', '2024-02-29'),
          task('MATCH B', true, 'High', '2024-03-01'),
          task('Other', true, 'Low', ''),
          task('Match deleted', true, 'High', '2024-02-29', true),
          task('Other deleted', false, 'Normal', '', true)
        ] }
      }) });
    }
    const check = (html, expected) => {
      const summaries = [...html.matchAll(/data-testid="directory-summary">([^<]*)<\/p>/g)];
      assert.equal(summaries.length, 1);
      assert.equal(summaries[0][1], expected);
      const rows = [...html.matchAll(/data-testid="directory-task-row"/g)].length;
      const completed = [...html.matchAll(/data-testid="directory-task-completion">Completed/g)].length;
      assert.equal(expected, `${completed}/${rows} completed`);
      assert.equal(html.includes('No matching tasks'), rows === 0);
    };
    const snapshots = await Promise.all([1, 2, 3].map(id => get(`/projects/${id}/export`)));
    for (const order of ['Original', 'Priority', 'Due date', 'Title']) {
      check(await get('/directory?' + new URLSearchParams({ order })), '4/6 completed');
      check(await get('/directory?' + new URLSearchParams({ order, scope: 'Archived' })), '2/3 completed');
      check(await get('/directory?' + new URLSearchParams({ order, filter: 'Deleted' })), '2/4 completed');
    }
    check(await get('/directory?scope=Archived&filter=Deleted'), '1/2 completed');
    check(await get('/directory?filter=Open'), '0/2 completed');
    check(await get('/directory?filter=Completed'), '4/4 completed');
    check(await get('/directory?priorityFilter=Low'), '2/2 completed');
    check(await get('/directory?search=match'), '2/4 completed');
    check(await get('/directory?search=Literal'), '0/0 completed');
    check(await get('/directory?dueFrom=2024-02-29&dueThrough=2024-02-29'), '0/2 completed');
    const state = { scope: 'Active', filter: 'All', priorityFilter: 'High', search: 'match', dueFrom: '2024-02-29', dueThrough: '2024-03-01', order: 'Title' };
    check(await post('/directory/due-range', { ...state, from: '2023-02-29', through: '' }), '2/4 completed');
    assert.deepEqual(await Promise.all([1, 2, 3].map(id => get(`/projects/${id}/export`))), snapshots);
    check(await post('/directory/completion', { ...state, filter: 'Open', completed: '1' }), '0/0 completed');
    check(await get('/directory'), '6/6 completed');
    check(await post('/directory/completion', { ...state, filter: 'Completed', completed: '0' }), '0/0 completed');
    check(await get('/directory'), '2/6 completed');
    check(await get('/directory?filter=Deleted'), '2/4 completed');
    check(await get('/directory?scope=Archived'), '2/3 completed');
    check(await get('/directory?search=other&filter=Completed'), '2/2 completed');
  } finally {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await rm(temp, { recursive: true, force: true });
  }
});
