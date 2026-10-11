import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('inclusive due ranges intersect filters, retain state during edits, and work when archived', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited ${code}`)));
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const rows = html => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-28', dueThrough: '2024-03-01' };
  const location = '/projects/1?' + new URLSearchParams(state);
  const apply = (from, through, saved = {}) => post('/projects/1/due-range', { ...saved, rangeFrom: from, rangeThrough: through });
  try {
    await start();
    await post('/projects', { name: 'Dates' });
    for (const title of ['Before', 'First', 'Leap', 'Last', 'After', 'Undated']) await post('/projects/1/tasks', { title });
    for (const [index, date] of ['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02'].entries()) {
      await post(`/projects/1/tasks/${index + 1}/due-date`, { dueDate: date });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority: 'High' });
    }
    const applied = await apply(' 2024-02-28 ', ' 2024-03-01 ', state);
    assert.equal(applied.headers.get('location'), location);
    assert.deepEqual(rows(await get(location)), ['First', 'Leap', 'Last']);
    for (const [from, through, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '0000-01-01', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-28', 'Due from must not be after Due through'],
    ]) {
      const response = await apply(from, through, state);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.ok(html.includes(`role="alert">${message}`));
      assert.deepEqual(rows(html), ['First', 'Leap', 'Last']);
      assert.match(html, /name="dueFrom" value="2024-02-28"/);
    }
    for (const [from, through, expected] of [
      ['', '2024-02-28', ['Before', 'First']],
      ['2024-03-01', '', ['Last', 'After']],
      ['', '', ['Before', 'First', 'Leap', 'Last', 'After', 'Undated']],
      ['2024-02-29', '2024-02-29', ['Leap']],
    ]) {
      const response = await apply(from, through);
      assert.deepEqual(rows(await get(response.headers.get('location'))), expected);
    }
    const edit = async (path, data) => {
      const response = await post(path, { ...state, ...data });
      assert.equal(response.headers.get('location'), location);
      return rows(await get(location));
    };
    assert.deepEqual(await edit('/projects/1/tasks/3/completion', { completed: '1' }), ['First', 'Last']);
    assert.deepEqual(await edit('/projects/1/tasks/2/priority', { priority: 'Low' }), ['Last']);
    assert.deepEqual(await edit('/projects/1/tasks/4/due-date', { dueDate: '2025-01-01' }), []);
    assert.deepEqual(await edit('/projects/1/tasks/4/due-date', { dueDate: '2024-02-29' }), ['Last']);
    assert.deepEqual(await edit('/projects/1/tasks/4/rename', { title: 'Renamed' }), ['Renamed']);
    await edit('/projects/1/rename', { name: 'Renamed project' });
    await edit('/projects/1/default-priority', { priority: 'High' });
    assert.deepEqual(await edit('/projects/1/tasks', { title: 'New undated' }), ['Renamed']);
    const html = await get(location);
    assert.match(html, /name="dueThrough" value="2024-03-01"/);
    const completed = await get(location.replace('filter=Open', 'filter=Completed'));
    assert.deepEqual(rows(completed), ['Leap']);
    assert.match(await get('/'), /1\/7 completed/);
    await post('/projects/1/archive');
    const archived = await get(location);
    assert.match(archived, /id="due-from"[^>]*value="2024-02-28" autocomplete="off">/);
    assert.match(archived, /<button type="submit">Apply due range<\/button>/);
    assert.match(archived, /id="task-due-date-4"[^>]*disabled/);
    assert.equal(rows(await get((await apply('', '')).headers.get('location'))).length, 7);
    await stop();
    await start();
    assert.deepEqual(rows(await get(location)), ['Renamed']);
    await post('/projects/1/restore');
    assert.deepEqual(rows(await get(location)), ['Renamed']);
    const reopened = await get('/projects/1');
    assert.equal(rows(reopened).length, 7);
    assert.match(reopened, /id="due-from"[^>]*value=""/);
    assert.match(reopened, /id="due-through"[^>]*value=""/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
