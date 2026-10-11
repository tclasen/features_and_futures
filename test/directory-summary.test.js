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
      const owners = [...html.matchAll(/data-testid="directory-owner-row">([\s\S]*?)<\/form>\s*<\/div>/g)].map(match => {
        const id = Number(match[1].match(/action="\/projects\/(\d+)"/)[1]);
        const counts = match[1].match(/directory-owner-summary">(\d+)\/(\d+) completed/);
        return { id, completed: Number(counts[1]), total: Number(counts[2]) };
      });
      assert.deepEqual(owners.map(owner => owner.id), [...new Set(owners.map(owner => owner.id))].sort((a, b) => a - b));
      assert.equal(owners.reduce((sum, owner) => sum + owner.total, 0), rows);
      assert.equal(owners.reduce((sum, owner) => sum + owner.completed, 0), completed);
      for (const owner of owners) {
        assert.ok(owner.total > 0);
        const taskRows = [...html.matchAll(/data-testid="directory-task-row">([\s\S]*?)<\/form>\s*<\/div>/g)]
          .filter(match => match[1].includes(`action="/projects/${owner.id}"`));
        assert.equal(owner.total, taskRows.length);
        assert.equal(owner.completed, taskRows.filter(match => match[1].includes('directory-task-completion">Completed')).length);
      }
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

    // Duplicate names are legal: owner rows and navigation remain identity-based.
    for (const id of [1, 2]) await post(`/projects/${id}/rename`, { name: '  Same <owner>  ' });
    let html = await get('/directory?order=Title');
    check(html, '2/6 completed');
    assert.equal([...html.matchAll(/directory-owner-name"[^>]*>Same &lt;owner&gt;<\/div>/g)].length, 2);
    assert.match(html, /directory-owner-summary">1\/3 completed/);
    const ownerActions = [...html.matchAll(/directory-owner-row">[\s\S]*?action="([^\"]+)"/g)].map(match => match[1]);
    assert.deepEqual(ownerActions, ['/projects/1', '/projects/2']);
    for (const action of ownerActions) {
      const detail = await get(action);
      assert.match(detail, /<h1>Same &lt;owner&gt;<\/h1>/);
      assert.match(detail, /id="task-filter"[^>]*>\s*<option selected>All/);
    }
    await post('/projects/2/rename', { name: 'Second owner' });
    html = await get('/directory?order=Priority');
    check(html, '2/6 completed');
    assert.equal([...html.matchAll(/directory-owner-name"[^>]*>Same &lt;owner&gt;<\/div>/g)].length, 1);
    assert.match(html, /directory-owner-name"[^>]*>Second owner<\/div>/);
  } finally {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await rm(temp, { recursive: true, force: true });
  }
});
