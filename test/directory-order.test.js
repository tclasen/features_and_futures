import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const titles = html => [...html.matchAll(/data-testid="directory-task-title"[^>]*>([^<]*)/g)].map(match => match[1]);
test('directory ordering is stable, code-point based, retained across actions, and view-only', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'workboard-order-'));
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
    const task = (title, priority = 'Normal', dueDate = '') => ({ title, priority, dueDate, completed: false, deleted: false, notes: '' });
    const imports = [
      [task('z', 'Low'), task('Alpha', 'High', '2025-01-01'), task('a  b', 'Normal', '2024-02-29'), task('\u{10000}')],
      [task('alpha', 'High', '2025-01-01'), task('a b', 'Low', '0001-01-01'), task('\uE000')]
    ];
    for (const [index, tasks] of imports.entries()) {
      await post('/projects/import', { importedName: `Owner ${index}`, projectJson: JSON.stringify({
        format: 'workboard-project', version: 1, project: { name: 'Portable', archived: false, defaultPriority: 'Normal', tasks }
      }) });
    }
    const original = imports.flat().map(task => task.title);
    const snapshots = await Promise.all([1, 2].map(id => get(`/projects/${id}/export`)));
    assert.deepEqual(titles(await get('/directory')), original);
    assert.match(await get('/directory'), /id="directory-order"[^>]*><option selected>Original<\/option><option>Priority<\/option><option>Due date<\/option><option>Title<\/option>/);
    const expected = {
      Priority: ['Alpha', 'alpha', 'a  b', '\u{10000}', '\uE000', 'z', 'a b'],
      'Due date': ['a b', 'a  b', 'Alpha', 'alpha', 'z', '\u{10000}', '\uE000'],
      Title: ['a  b', 'a b', 'Alpha', 'alpha', 'z', '\uE000', '\u{10000}']
    };
    for (const [order, result] of Object.entries(expected)) {
      const html = await get('/directory?' + new URLSearchParams({ order }));
      assert.deepEqual(titles(html), result);
      for (const form of html.matchAll(/<form[^>]*action="\/directory[^\"]*"[\s\S]*?<\/form>/g)) {
        assert.ok(form[0].includes('name="order"'));
        assert.ok(form[0].includes(`value="${order}"`) || form[0].includes(`<option selected>${order}</option>`));
      }
    }
    assert.deepEqual(await Promise.all([1, 2].map(id => get(`/projects/${id}/export`))), snapshots);
    assert.deepEqual(titles(await get('/directory?order=invalid')), original);
    let state = { scope: 'Active', filter: 'Open', priorityFilter: 'All', order: 'Title', search: 'a', dueFrom: '', dueThrough: '' };
    let html = await post('/directory/due-range', { ...state, from: 'bad', through: '' });
    assert.match(html, /role="alert">Due range must use valid/);
    assert.deepEqual(titles(html), ['a  b', 'a b', 'Alpha', 'alpha']);
    assert.match(html, /<option selected>Title<\/option>/);
    html = await post('/directory/due-range', { ...state, from: '0001-01-01', through: '9999-12-31' });
    assert.deepEqual(titles(html), ['a  b', 'a b', 'Alpha', 'alpha']);
    state = { ...state, dueFrom: '0001-01-01', dueThrough: '9999-12-31' };
    html = await post('/directory/completion', { ...state, completed: '1' });
    assert.deepEqual(titles(html), []);
    assert.match(html, /No matching tasks/);
    assert.match(html, /<option selected>Title<\/option>/);
    assert.deepEqual(titles(await get('/directory?filter=Completed&order=Title')), ['a  b', 'a b', 'Alpha', 'alpha']);
    // The same comparators apply to read-only archived and deleted views.
    await post('/projects/1/tasks/1/delete', {});
    await post('/projects/2/tasks/6/delete', {});
    assert.deepEqual(titles(await get('/directory?filter=Deleted&order=Title')), ['a b', 'z']);
    await post('/projects/1/archive', {});
    await post('/projects/2/archive', {});
    assert.deepEqual(titles(await get('/directory?scope=Archived&filter=Deleted&order=Title')), ['a b', 'z']);
    assert.deepEqual(titles(await get('/directory?scope=Archived&order=Priority')), ['Alpha', 'alpha', 'a  b', '\u{10000}', '\uE000']);
    assert.deepEqual(titles(await get('/directory?scope=Archived')), ['Alpha', 'a  b', '\u{10000}', 'alpha', '\uE000']);
  } finally {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await rm(temp, { recursive: true, force: true });
  }
});
