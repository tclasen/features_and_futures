import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

async function launch(db) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: db }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Server exited')));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; },
  };
}

test('inclusive due ranges intersect filters, retain state through edits, validate and work archived', async () => {
  const directory = await mkdtemp(path.resolve('data/due-range-test-'));
  let server;
  try {
    server = await launch(path.join(directory, 'db.sqlite'));
    const post = (route, values = {}) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (route) => (await fetch(server.url + route)).text();
    const rows = (markup) => [...markup.matchAll(/aria-label="Complete ([^"]+)"/g)].map((match) => match[1]);
    const apply = (values) => post('/projects/1/due-range', values);
    await post('/projects', { name: 'Dates' });
    for (const title of ['Undated', 'Before', 'First', 'Last', 'After']) await post('/projects/1/tasks', { title });
    for (const [id, dueDate] of [[2, '2024-02-28'], [3, '2024-02-29'], [4, '2024-03-01'], [5, '2024-03-02']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate });
    }
    const range = { rangeFrom: '2024-02-29', rangeThrough: '2024-03-01' };
    let response = await apply({ dueFrom: ' 2024-02-29 ', dueThrough: '2024-03-01  ' });
    const route = response.headers.get('location');
    assert.deepEqual(rows(await html(route)), ['First', 'Last']);
    assert.deepEqual(rows(await html((await apply({ dueFrom: '', dueThrough: '2024-02-29' })).headers.get('location'))), ['Before', 'First']);
    assert.deepEqual(rows(await html((await apply({ dueFrom: '2024-03-01', dueThrough: '' })).headers.get('location'))), ['Last', 'After']);
    assert.deepEqual(rows(await html((await apply({ dueFrom: '', dueThrough: '' })).headers.get('location'))), ['Undated', 'Before', 'First', 'Last', 'After']);
    for (const [dueFrom, dueThrough, message] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-02', '2024-03-01', 'Due from must not be after Due through'],
    ]) {
      const markup = await (await apply({ dueFrom, dueThrough, ...range })).text();
      assert.match(markup, new RegExp(`role="alert">${message}`));
      assert.deepEqual(rows(markup), ['First', 'Last']);
      assert.match(markup, /name="rangeFrom" value="2024-02-29"/);
    }
    await post('/projects/1/tasks/3/priority', { priority: 'High', ...range });
    await post('/projects/1/tasks/4/priority', { priority: 'High', ...range });
    const state = { ...range, filter: 'Open', priorityFilter: 'High' };
    const filtered = '/projects/1?' + new URLSearchParams(state);
    assert.deepEqual(rows(await html(filtered)), ['First', 'Last']);
    response = await post('/projects/1/tasks/3', { completed: '1', ...state });
    assert.deepEqual(rows(await html(response.headers.get('location'))), ['Last']);
    response = await post('/projects/1/tasks/4/priority', { priority: 'Low', ...state });
    assert.deepEqual(rows(await html(response.headers.get('location'))), []);
    await post('/projects/1/tasks/4/priority', { priority: 'High', ...state });
    response = await post('/projects/1/tasks/4/due-date', { dueDate: '', ...state });
    assert.deepEqual(rows(await html(response.headers.get('location'))), []);
    await post('/projects/1/tasks/4/due-date', { dueDate: '2024-02-29', ...state });
    for (const [endpoint, values] of [
      ['tasks/4/rename', { title: 'Renamed' }], ['rename', { name: 'Renamed project' }],
      ['default-priority', { priority: 'High' }], ['tasks', { title: 'New undated' }],
    ]) {
      response = await post(`/projects/1/${endpoint}`, { ...values, ...state });
      const markup = await html(response.headers.get('location'));
      assert.deepEqual(rows(markup), ['Renamed']);
      assert.match(markup, /<option selected>Open<\/option>/);
      assert.match(markup, /name="dueFrom" type="text" value="2024-02-29"/);
    }
    assert.match(await html('/'), /1\/6 completed/);
    const invalidDate = await (await post('/projects/1/tasks/4/due-date', { dueDate: 'bad', ...state })).text();
    assert.deepEqual(rows(invalidDate), ['Renamed']);
    await post('/projects/1/archive');
    const archived = await html(filtered);
    assert.deepEqual(rows(archived), ['Renamed']);
    assert.match(archived, /Archived project/);
    assert.match(archived, /name="dueFrom" type="text" value="2024-02-29">/);
    assert.match(archived, /disabled>Save due date/);
    response = await apply({ dueFrom: '0001-01-01', dueThrough: '9999-12-31', ...state });
    assert.deepEqual(rows(await html(response.headers.get('location'))), ['Renamed']);
    await server.stop();
    server = await launch(path.join(directory, 'db.sqlite'));
    assert.deepEqual(rows(await html(filtered)), ['Renamed']);
    await post('/projects/1/restore');
    const reopened = await html('/projects/1');
    assert.deepEqual(rows(reopened), ['Undated', 'Before', 'First', 'Renamed', 'After', 'New undated']);
    assert.match(reopened, /name="dueFrom" type="text" value=""/);
    assert.match(reopened, /name="dueThrough" type="text" value=""/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
