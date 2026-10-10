import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

test('combined filters preserve selections, re-evaluate edits, and work archived and after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') }, stdio: 'ignore',
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server not healthy');
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const get = async path => (await fetch(base + path)).text();
  const rows = html => [...html.matchAll(/data-testid="task-row"[\s\S]*?<span>(.*?)<\/span>/g)].map(match => match[1]);
  const selected = (html, id, value) => {
    const select = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1];
    assert.match(select, new RegExp(`<option selected>${value}</option>`));
  };
  try {
    await start();
    await post('/projects', { name: 'Filters' });
    for (const title of ['First', 'Second', 'Third', 'Fourth']) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    await post('/projects/1/tasks/3', { completed: '1' });
    let html = await get('/projects/1');
    selected(html, 'priority-filter', 'All');
    assert.deepEqual(rows(html), ['First', 'Second', 'Third', 'Fourth']);
    const prioritySelect = html.match(/<select id="priority-filter"[^>]*>([\s\S]*?)<\/select>/)[1];
    assert.deepEqual([...prioritySelect.matchAll(/<option[^>]*>(.*?)<\/option>/g)].map(m => m[1]), ['All', 'Low', 'Normal', 'High']);
    const expected = {
      All: { All: ['First', 'Second', 'Third', 'Fourth'], Low: ['Second'], Normal: ['Fourth'], High: ['First', 'Third'] },
      Open: { All: ['First', 'Second', 'Fourth'], Low: ['Second'], Normal: ['Fourth'], High: ['First'] },
      Completed: { All: ['Third'], Low: [], Normal: [], High: ['Third'] },
    };
    for (const [filter, priorities] of Object.entries(expected)) {
      for (const [priorityFilter, titles] of Object.entries(priorities)) {
        html = await get(`/projects/1?filter=${filter}&priorityFilter=${priorityFilter}`);
        selected(html, 'task-filter', filter);
        selected(html, 'priority-filter', priorityFilter);
        assert.deepEqual(rows(html), titles);
      }
    }
    const filters = { filter: 'Open', priorityFilter: 'High' };
    let response = await post('/projects/1/tasks/1/rename', { ...filters, title: ' Renamed ' });
    assert.equal(response.headers.get('location'), '/projects/1?filter=Open&priorityFilter=High');
    html = await get(response.headers.get('location'));
    assert.deepEqual(rows(html), ['Renamed']);
    assert.match(html, /aria-label="Complete Renamed"/);
    selected(html, 'task-filter', 'Open');
    selected(html, 'priority-filter', 'High');
    assert.equal((html.match(/name="priorityFilter" value="High"/g) || []).length, 8);
    response = await post('/projects/1/tasks/1/rename', { ...filters, title: ' ' });
    assert.equal(response.status, 400);
    html = await response.text();
    selected(html, 'priority-filter', 'High');
    assert.deepEqual(rows(html), ['Renamed']);
    response = await post('/projects/1/tasks/1/priority', { ...filters, priority: 'Low' });
    assert.deepEqual(rows(await get(response.headers.get('location'))), []);
    await post('/projects/1/tasks/1/priority', { ...filters, priority: 'High' });
    response = await post('/projects/1/tasks/1', { ...filters, completed: '1' });
    html = await get(response.headers.get('location'));
    selected(html, 'task-filter', 'Open');
    selected(html, 'priority-filter', 'High');
    assert.deepEqual(rows(html), []);
    assert.match(await get('/'), /2\/4 completed/);
    await post('/projects/1/archive');
    html = await get('/projects/1?filter=Completed&priorityFilter=High');
    assert.deepEqual(rows(html), ['Renamed', 'Third']);
    assert.match(html, /Archived project/);
    assert.match(html, /name="completed"[^>]*disabled/);
    assert.match(html, /name="priority" disabled/);
    assert.doesNotMatch(html, /id="(?:task|priority)-filter"[^>]*disabled/);
    await stop();
    await start();
    assert.equal(await get('/projects/1?filter=Completed&priorityFilter=High'), html);
    await post('/projects/1/restore');
    html = await get('/projects/1?filter=Completed&priorityFilter=High');
    assert.deepEqual(rows(html), ['Renamed', 'Third']);
    assert.doesNotMatch(html, /<(?:input|button|select)\b[^>]*\sdisabled/);
    selected(await get('/projects/1'), 'priority-filter', 'All');
    assert.match(await get('/'), /2\/4 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
