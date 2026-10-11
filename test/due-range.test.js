import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('inclusive due ranges intersect filters and remain applied across edits and invalid applications', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const base = await new Promise((resolve, reject) => {
      child.stdout.on('data', data => {
        const match = String(data).match(/port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Exited ${code}`)));
    });
    const post = (path, values = {}) => fetch(base + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = path => fetch(base + path).then(r => r.text());
    const ids = text => [...text.matchAll(/class="completion-form"[^>]*tasks\/(\d+)\/completion/g)].map(m => Number(m[1]));
    await post('/projects', { name: 'Dates' });
    for (const title of ['Undated', 'First', 'Middle', 'Last', 'Outside']) {
      await post('/projects/1/tasks', { title });
    }
    for (const [id, date] of [[2, '2024-02-28'], [3, '2024-02-29'], [4, '2024-03-01'], [5, '2024-03-02']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: date });
    }
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    await post('/projects/1/tasks/3/completion', { completed: '1' });
    const summary = await html('/');
    const range = { dueFrom: '2024-02-28', dueThrough: '2024-03-01' };
    const selection = { ...range, filter: 'All', priorityFilter: 'All' };
    const applied = await post('/projects/1/due-range', { from: ' 2024-02-28 ', through: '2024-03-01 ' });
    assert.equal(applied.status, 303);
    const path = applied.headers.get('location');
    assert.deepEqual(ids(await html(path)), [2, 3, 4]);
    assert.deepEqual(ids(await html('/projects/1?dueFrom=2024-03-01')), [4, 5]);
    assert.deepEqual(ids(await html('/projects/1?dueThrough=2024-02-28')), [2]);
    assert.deepEqual(ids(await html('/projects/1')), [1, 2, 3, 4, 5]);
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const expected = [2, 3, 4].filter(id => (completion === 'All' || (id === 3) === (completion === 'Completed')) &&
          (priority === 'All' || priority === (id === 3 ? 'High' : 'Normal')));
        assert.deepEqual(ids(await html(`/projects/1?dueFrom=${range.dueFrom}&dueThrough=${range.dueThrough}&priorityFilter=${priority}&filter=${completion}`)), expected);
      }
    }
    for (const [from, through, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '0000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-02', '2024-03-01', 'Due from must not be after Due through'],
    ]) {
      const response = await post('/projects/1/due-range', { ...selection, from, through });
      assert.equal(response.status, 400);
      const text = await response.text();
      assert.ok(text.includes(`role="alert">${message}`));
      assert.deepEqual(ids(text), [2, 3, 4]);
      assert.match(text, /id="due-from"[^>]*value="2024-02-28"/);
    }
    for (const [endpoint, values] of [
      ['/rename', { name: 'Renamed project' }],
      ['/default-priority', { priority: 'Low' }],
      ['/tasks', { title: 'New undated' }],
      ['/tasks/2/rename', { title: 'Renamed task' }],
    ]) {
      const response = await post('/projects/1' + endpoint, { ...selection, ...values });
      assert.equal(response.headers.get('location'), path);
      assert.deepEqual(ids(await html(path)), [2, 3, 4]);
    }
    const changed = await post('/projects/1/tasks/2/due-date', { ...selection, dueDate: '2024-03-03' });
    assert.equal(changed.headers.get('location'), path);
    assert.deepEqual(ids(await html(path)), [3, 4]);
    const highPath = path.replace('filter=All', 'filter=Completed') + '&priorityFilter=High';
    const highSelection = { ...selection, filter: 'Completed', priorityFilter: 'High' };
    const priorityResponse = await post('/projects/1/tasks/3/priority', { ...highSelection, priority: 'Low' });
    assert.deepEqual(ids(await html(priorityResponse.headers.get('location'))), []);
    await post('/projects/1/tasks/3/priority', { ...highSelection, priority: 'High' });
    const completionResponse = await post('/projects/1/tasks/3/completion', highSelection);
    assert.deepEqual(ids(await html(completionResponse.headers.get('location'))), []);
    await post('/projects/1/tasks/3/completion', { ...highSelection, completed: '1' });
    assert.deepEqual(ids(await html(highPath)), [3]);
    await post('/projects/1/archive');
    const archived = await html(path);
    assert.match(archived, /Archived project/);
    assert.match(archived, /id="due-from"[^>]*value="2024-02-28" autocomplete="off">/);
    assert.match(archived, /<button type="submit">Apply due range<\/button>/);
    const clear = await post('/projects/1/due-range', { ...selection, from: ' ', through: '' });
    assert.deepEqual(ids(await html(clear.headers.get('location'))), [1, 2, 3, 4, 5, 6]);
    await post('/projects/1/restore');
    assert.deepEqual(ids(await html(path)), [3, 4]);
    assert.ok(summary.includes('1/5 completed'));
    assert.match(await html('/'), /1\/6 completed/);
  } finally {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
