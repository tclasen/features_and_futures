import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('ASCII substring searches intersect filters and survive mutations without changing stored data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  let child;
  let base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(dir, 'db.sqlite') }, stdio: ['ignore', 'pipe', 'inherit']
    });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  };
  const stop = async () => { const exited = once(child, 'exit'); child.kill(); await exited; };
  const html = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const rows = text => [...text.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const page = values => '/projects/1?' + new URLSearchParams(values);
  try {
    await start();
    for (const name of ['Alpha  Team', 'ALPHA Team', 'ÄLPHA Team', 'Other']) await post('/projects', { name });
    let text = await html('/?search=' + encodeURIComponent('  alpha  '));
    assert.equal((text.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(text, /name="search" value="alpha"/);
    text = await html('/?search=alpha%20%20team');
    assert.equal((text.match(/data-testid="project-row"/g) || []).length, 1);
    assert.match(text, /Alpha  Team/);
    assert.equal((await html('/?search=%C3%A4lpha')).includes('data-testid="project-row"'), false);
    await post('/projects/2/archive');
    text = await html('/?filter=Archived&search=alpha');
    assert.match(text, /ALPHA Team/);
    assert.equal((text.match(/data-testid="project-row"/g) || []).length, 1);
    text = await html('/');
    assert.match(text, /id="project-search" name="search" type="text" value=""/);
    for (const title of ['Alpha  one', 'ALPHA two', 'Other', 'Älpha']) await post('/projects/1/tasks', { title });
    for (const id of [1, 2]) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { due_date: '2024-02-29' });
    }
    await post('/projects/1/tasks/2', { completed: '1' });
    const filters = { search: 'alpha', filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-02-29' };
    text = await html(page(filters));
    assert.deepEqual(rows(text), ['Alpha  one']);
    assert.match(text, /id="task-search" name="search" type="text" value="alpha"/);
    assert.match(text, /name="search" value="alpha"/);
    assert.deepEqual(rows(await html(page({ search: '  ALPHA  one  ' }))), ['Alpha  one']);
    assert.deepEqual(rows(await html(page({ search: 'alpha one' }))), []);
    let response = await fetch(base + page({ ...filters, applyRange: '1', rangeFrom: '2024-02-29', rangeThrough: '' }), { redirect: 'manual' });
    assert.equal(new URL(response.headers.get('location'), base).searchParams.get('search'), 'alpha');
    for (const [path, values, expected] of [
      ['/projects/1/rename', { name: 'Changed' }, ['Alpha  one']],
      ['/projects/1/default-priority', { priority: 'Low' }, ['Alpha  one']],
      ['/projects/1/tasks', { title: 'Alpha new' }, ['Alpha  one']],
      ['/projects/1/tasks/1/rename', { title: 'Alpha renamed' }, ['Alpha renamed']],
      ['/projects/1/tasks/1/due-date', { due_date: 'bad' }, ['Alpha renamed']],
      ['/projects/1/tasks/1/rename', { title: '   ' }, ['Alpha renamed']],
      ['/projects/1/tasks/1/rename', { title: 'No match' }, []],
      ['/projects/1/tasks/1/rename', { title: 'Alpha again' }, ['Alpha again']],
      ['/projects/1/tasks/1/priority', { priority: 'Low' }, []],
      ['/projects/1/tasks/1/priority', { priority: 'High' }, ['Alpha again']],
      ['/projects/1/tasks/1', { completed: '1' }, []],
      ['/projects/1/tasks/1', {}, ['Alpha again']],
      ['/projects/1/tasks/1/due-date', { due_date: '' }, []],
      ['/projects/1/tasks/1/due-date', { due_date: '2024-02-29' }, ['Alpha again']],
      ['/projects/1/tasks/1/move', { destination: '4' }, []]
    ]) {
      response = await post(path, { ...filters, ...values });
      text = response.status === 303 ? await html(response.headers.get('location')) : await response.text();
      assert.deepEqual(rows(text), expected, path);
      assert.match(text, /name="search" value="alpha"/);
      assert.match(text, /<option selected>Open/);
      assert.match(text, /<option selected>High/);
      assert.match(text, /name="dueFrom" value="2024-02-29"/);
    }
    await post('/projects/4/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await html(page({ search: 'alpha' }))), ['Alpha again', 'ALPHA two', 'Alpha new']);
    assert.match(await html('/'), /1\/5 completed/);
    await post('/projects/1/archive');
    text = await html(page({ search: 'alpha' }));
    assert.deepEqual(rows(text), ['Alpha again', 'ALPHA two', 'Alpha new']);
    assert.match(text, /<button type="submit">Search tasks/);
    assert.match(text, /id="new-task-title-1"[^>]* disabled/);
    await post('/projects/1/restore');
    await stop();
    await start();
    assert.deepEqual(rows(await html(page(filters))), ['Alpha again']);
    text = await html('/projects/1');
    assert.match(text, /id="task-search" name="search" type="text" value=""/);
    assert.equal(rows(text).length, 5);
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
