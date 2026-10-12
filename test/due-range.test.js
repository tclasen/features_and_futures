import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('inclusive due ranges intersect filters and survive edits, validation errors and archival', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'data.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const rows = body => [...body.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
  const location = '/projects/1?filter=Open&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-03-01';
  try {
    await start();
    await post('/projects', { name: 'Range project' });
    for (const title of ['Before', 'Start', 'End', 'After', 'Undated']) {
      await post('/projects/1/tasks', { title });
    }
    for (const [index, dueDate] of ['2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02', ''].entries()) {
      await post(`/projects/1/tasks/${index + 1}/due-date`, { dueDate });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority: 'High' });
    }
    const summary = await get('/');
    const result = await post('/projects/1/due-range', { filter: 'Open', priorityFilter: 'High', from: ' 2024-02-29 ', through: '2024-03-01 ' });
    assert.equal(result.headers.get('location'), location);
    let body = await get(location);
    assert.deepEqual(rows(body), ['Start', 'End']);
    assert.match(body, /name="dueFrom" value="2024-02-29"/);
    assert.match(body, /id="due-through" name="through" type="text" value="2024-03-01"/);
    for (const [from, through, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '2024-04-31', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-02', '2024-03-01', 'Due from must not be after Due through'],
    ]) {
      const invalid = await post('/projects/1/due-range', { ...state, from, through });
      assert.equal(invalid.status, 400);
      body = await invalid.text();
      assert.ok(body.includes(`role="alert">${message}`));
      assert.deepEqual(rows(body), ['Start', 'End']);
      assert.match(body, /name="dueFrom" value="2024-02-29"/);
    }
    assert.deepEqual(rows(await get('/projects/1?dueFrom=2024-03-01')), ['End', 'After']);
    assert.deepEqual(rows(await get('/projects/1?dueThrough=2024-02-29')), ['Before', 'Start']);
    assert.equal(rows(await get('/projects/1')).length, 5);
    for (const [path, values] of [
      ['/projects/1/tasks/2/rename', { title: 'Renamed' }],
      ['/projects/1/rename', { name: 'Renamed project' }],
      ['/projects/1/default-priority', { priority: 'Low' }],
      ['/projects/1/tasks', { title: 'New undated' }],
    ]) {
      const edited = await post(path, { ...state, ...values });
      assert.equal(edited.headers.get('location'), location);
      assert.deepEqual(rows(await get(location)), ['Renamed', 'End']);
    }
    await post('/projects/1/tasks/2/priority', { ...state, priority: 'Low' });
    assert.deepEqual(rows(await get(location)), ['End']);
    assert.deepEqual(rows(await get(location.replace('High', 'Low'))), ['Renamed']);
    await post('/projects/1/tasks/2/priority', { ...state, priority: 'High' });
    await post('/projects/1/tasks/2', { ...state, completed: '1' });
    assert.deepEqual(rows(await get(location)), ['End']);
    assert.deepEqual(rows(await get(location.replace('Open', 'Completed'))), ['Renamed']);
    await post('/projects/1/tasks/2', state);
    await post('/projects/1/tasks/2/due-date', { ...state, dueDate: '2024-03-03' });
    assert.deepEqual(rows(await get(location)), ['End']);
    const invalidDate = await post('/projects/1/tasks/3/due-date', { ...state, dueDate: 'bad' });
    assert.deepEqual(rows(await invalidDate.text()), ['End']);
    await post('/projects/1/tasks/3/due-date', { ...state, dueDate: '' });
    assert.deepEqual(rows(await get(location)), []);
    await stop();
    await start();
    assert.deepEqual(rows(await get(location)), []);
    assert.equal(rows(await get('/projects/1')).length, 6);
    await post('/projects/1/archive');
    const archived = await post('/projects/1/due-range', { ...state, from: '', through: '' });
    const archivedBody = await get(archived.headers.get('location'));
    assert.equal(rows(archivedBody).length, 5);
    assert.match(archivedBody, /Archived project/);
    assert.match(archivedBody, /id="due-from" name="from" type="text" value="">/);
    assert.match(archivedBody, /disabled>Save due date/);
    await post('/projects/1/restore');
    assert.deepEqual(rows(await get(location)), []);
    // Filtering alone never changes summaries.
    const finalSummary = await get('/');
    await get('/projects/1?dueFrom=0001-01-01&dueThrough=9999-12-31');
    assert.equal(await get('/'), finalSummary);
    assert.match(summary, /5 completed/);
    assert.match(finalSummary, /0\/6 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
