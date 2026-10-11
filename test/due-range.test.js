import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('inclusive due ranges intersect filters, validate without changing membership and survive edits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: join(dir, 'db.sqlite') }, stdio: ['ignore', 'pipe', 'inherit']
  });
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
    const html = async path => (await fetch(base + path)).text();
    const post = (path, values = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
    const rows = text => [...text.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
    const page = values => '/projects/1?' + new URLSearchParams(values);
    await post('/projects', { name: 'Dates' });
    for (const title of ['Undated', 'Before', 'Start', 'Middle', 'End', 'After']) await post('/projects/1/tasks', { title });
    for (const [id, date] of [[2, '2024-02-28'], [3, '2024-02-29'], [4, '2024-03-01'], [5, '2024-03-02'], [6, '2024-03-03']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { due_date: date });
    }
    const range = { dueFrom: '2024-02-29', dueThrough: '2024-03-02' };
    let response = await fetch(base + page({ applyRange: '1', rangeFrom: ' 2024-02-29 ', rangeThrough: ' 2024-03-02 ' }), { redirect: 'manual' });
    assert.equal(response.status, 303);
    assert.deepEqual(rows(await html(response.headers.get('location'))), ['Start', 'Middle', 'End']);
    assert.deepEqual(rows(await html(page({ dueFrom: range.dueFrom }))), ['Start', 'Middle', 'End', 'After']);
    assert.deepEqual(rows(await html(page({ dueThrough: range.dueFrom }))), ['Before', 'Start']);
    assert.equal(rows(await html('/projects/1')).length, 6);
    for (const bad of ['0000-01-01', '1900-02-29', '2024-04-31', '2024-2-29', '10000-01-01', 'oops']) {
      const text = await html(page({ ...range, applyRange: '1', rangeFrom: bad, rangeThrough: '' }));
      assert.match(text, /role="alert">Due range must use valid YYYY-MM-DD dates/);
      assert.deepEqual(rows(text), ['Start', 'Middle', 'End']);
    }
    let text = await html(page({ ...range, applyRange: '1', rangeFrom: '2024-03-03', rangeThrough: '2024-02-29' }));
    assert.match(text, /Due from must not be after Due through/);
    assert.deepEqual(rows(text), ['Start', 'Middle', 'End']);
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    await post('/projects/1/tasks/4/priority', { priority: 'High' });
    await post('/projects/1/tasks/4', { completed: '1' });
    const filters = { ...range, filter: 'Open', priorityFilter: 'High' };
    assert.deepEqual(rows(await html(page(filters))), ['Start']);
    response = await post('/projects/1/tasks/3/rename', { ...filters, title: 'Renamed' });
    text = await html(response.headers.get('location'));
    assert.deepEqual(rows(text), ['Renamed']);
    assert.match(text, /name="dueFrom" value="2024-02-29"/);
    assert.match(text, /<option selected>Open/);
    assert.match(text, /<option selected>High/);
    for (const [path, values] of [
      ['/projects/1/rename', { name: 'Renamed project' }],
      ['/projects/1/default-priority', { priority: 'Low' }],
      ['/projects/1/tasks', { title: 'New undated task' }]
    ]) {
      response = await post(path, { ...filters, ...values });
      assert.deepEqual(rows(await html(response.headers.get('location'))), ['Renamed']);
    }
    response = await post('/projects/1/tasks/3/due-date', { ...filters, due_date: '2024-03-03' });
    assert.deepEqual(rows(await html(response.headers.get('location'))), []);
    response = await post('/projects/1/tasks/3/due-date', { ...filters, due_date: '2024-02-29' });
    assert.deepEqual(rows(await html(response.headers.get('location'))), ['Renamed']);
    response = await post('/projects/1/tasks/3', { ...filters, completed: '1' });
    assert.deepEqual(rows(await html(response.headers.get('location'))), []);
    response = await post('/projects/1/tasks/3', filters);
    assert.deepEqual(rows(await html(response.headers.get('location'))), ['Renamed']);
    response = await post('/projects/1/tasks/3/priority', { ...filters, priority: 'Low' });
    assert.deepEqual(rows(await html(response.headers.get('location'))), []);
    assert.match(await html('/'), /1\/7 completed/);
    await post('/projects/1/archive');
    text = await html(page(range));
    assert.deepEqual(rows(text), ['Renamed', 'Middle', 'End']);
    assert.match(text, /id="due-from" type="text" name="rangeFrom" value="2024-02-29">/);
    assert.match(text, /<button type="submit">Apply due range/);
    assert.match(text, /Save due date/);
    assert.match(text, /id="task-due-date-3"[^>]* disabled/);
    await post('/projects/1/restore');
    assert.deepEqual(rows(await html(page(range))), ['Renamed', 'Middle', 'End']);
    text = await html('/projects/1');
    assert.match(text, /id="due-from" type="text" name="rangeFrom" value=""/);
    assert.match(text, /id="due-through" type="text" name="rangeThrough" value=""/);
    assert.equal(rows(text).length, 7);
  } finally {
    const exited = once(child, 'exit'); child.kill(); await exited;
    await rm(dir, { recursive: true, force: true });
  }
});
