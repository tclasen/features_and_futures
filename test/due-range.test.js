import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('inclusive due ranges intersect filters and survive edits without changing data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  const port = 40000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') }, stdio: 'ignore',
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Server exited');
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const rows = html => [...html.matchAll(/<label for="task-\d+">([^<]+)<\/label>/g)].map(match => match[1]);
  const selected = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
  const location = '/projects/1?filter=Open&priorityFilter=High&dueFrom=2024-02-29&dueThrough=2024-03-01';
  const apply = (from, through, state = {}) => post('/projects/1/due-range', { ...state, from, through });
  async function redirected(response, expected) {
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), expected);
    return get(expected);
  }
  try {
    await start();
    await post('/projects', { name: 'Dates' });
    for (const title of ['Early', 'Start', 'End', 'Late', 'Undated']) {
      await post('/projects/1/tasks', { title });
    }
    for (const [id, date] of [[1, '0001-01-01'], [2, '2024-02-29'], [3, '2024-03-01'], [4, '9999-12-31']]) {
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: date });
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
    }
    await post('/projects/1/tasks/5/priority', { priority: 'High' });
    const all = ['Early', 'Start', 'End', 'Late', 'Undated'];
    assert.deepEqual(rows(await get('/projects/1')), all);
    let html = await redirected(await apply(' 2024-02-29 ', ' 2024-03-01 ', selected), location);
    assert.deepEqual(rows(html), ['Start', 'End']);
    assert.match(html, /id="due-from" name="from" type="text" value="2024-02-29"/);
    assert.match(html, /id="due-through" name="through" type="text" value="2024-03-01"/);
    assert.match(html, /<option selected>Open<\/option>/);
    assert.match(html, /<option selected>High<\/option>/);
    // All editing forms and the completion/priority filter form carry the applied range.
    for (const form of html.matchAll(/<form[^>]+action="\/projects\/1(?:\/[^\"]*)?"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="dueFrom" value="2024-02-29"/);
      assert.match(form[1], /name="dueThrough" value="2024-03-01"/);
    }
    for (const [from, through, message] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '1900-02-29', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-2-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '<script>', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-02', '2024-03-01', 'Due from must not be after Due through'],
    ]) {
      const response = await apply(from, through, selected);
      assert.equal(response.status, 400);
      html = await response.text();
      assert.ok(html.includes(`role="alert">${message}`));
      assert.deepEqual(rows(html), ['Start', 'End']);
      assert.match(html, /name="dueFrom" value="2024-02-29"/);
    }
    assert.deepEqual(rows(await redirected(await apply('', '2024-02-29'), '/projects/1?filter=All&dueThrough=2024-02-29')), ['Early', 'Start']);
    assert.deepEqual(rows(await redirected(await apply('2024-03-01', ''), '/projects/1?filter=All&dueFrom=2024-03-01')), ['End', 'Late']);
    assert.deepEqual(rows(await redirected(await apply('2024-02-29', '2024-02-29'), '/projects/1?filter=All&dueFrom=2024-02-29&dueThrough=2024-02-29')), ['Start']);
    assert.deepEqual(rows(await redirected(await apply(' ', ' '), '/projects/1?filter=All')), all);
    assert.deepEqual(rows(await get(location.replace('filter=Open', 'filter=Completed'))), []);
    assert.deepEqual(rows(await get(location.replace('priorityFilter=High', 'priorityFilter=Low'))), []);
    html = await redirected(await post('/projects/1/tasks/2', { ...selected, completed: '1' }), location);
    assert.deepEqual(rows(html), ['End']);
    assert.deepEqual(rows(await get(location.replace('filter=Open', 'filter=Completed'))), ['Start']);
    html = await redirected(await post('/projects/1/tasks/3/priority', { ...selected, priority: 'Low' }), location);
    assert.deepEqual(rows(html), []);
    await redirected(await post('/projects/1/tasks/3/priority', { ...selected, priority: 'High' }), location);
    html = await redirected(await post('/projects/1/tasks/3/due-date', { ...selected, dueDate: '2024-03-02' }), location);
    assert.deepEqual(rows(html), []);
    await redirected(await post('/projects/1/tasks/3/due-date', { ...selected, dueDate: '2024-03-01' }), location);
    html = await redirected(await post('/projects/1/tasks/3/rename', { ...selected, title: 'Renamed' }), location);
    assert.deepEqual(rows(html), ['Renamed']);
    await redirected(await post('/projects/1/rename', { ...selected, name: 'Renamed project' }), location);
    html = await redirected(await post('/projects/1/default-priority', { ...selected, priority: 'Low' }), location);
    assert.deepEqual(rows(html), ['Renamed']);
    html = await redirected(await post('/projects/1/tasks', { ...selected, title: 'New undated' }), location);
    assert.deepEqual(rows(html), ['Renamed']);
    assert.match(await get('/'), /data-testid="project-summary">1\/6 completed/);
    await stop();
    await start();
    assert.deepEqual(rows(await get(location)), ['Renamed']);
    await post('/projects/1/archive');
    html = await get(location);
    assert.deepEqual(rows(html), ['Renamed']);
    assert.match(html, /id="task-due-date-3"[^>]*value="2024-03-01" disabled/);
    for (const id of ['task-filter', 'priority-filter', 'due-from', 'due-through']) {
      const control = html.match(new RegExp(`<(?:input|select) id="${id}"[^>]*>`))[0];
      assert.ok(!control.includes('disabled'));
    }
    html = await redirected(await apply('', '', selected), '/projects/1?filter=Open&priorityFilter=High');
    assert.deepEqual(rows(html), ['Early', 'Renamed', 'Late', 'Undated']);
    await post('/projects/1/restore');
    assert.deepEqual(rows(await get(location)), ['Renamed']);
    // Opening the plain project URL resets transient ranges and both filters.
    html = await get('/projects/1');
    assert.deepEqual(rows(html), ['Early', 'Start', 'Renamed', 'Late', 'Undated', 'New undated']);
    assert.match(html, /id="due-from" name="from" type="text" value=""/);
    assert.match(html, /id="due-through" name="through" type="text" value=""/);
    assert.match(await get('/'), /action="\/projects\/1" method="get"><button type="submit">Open project/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
