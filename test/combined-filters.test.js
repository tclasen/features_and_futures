import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('combined filters preserve selections through edits, archive, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') },
      stdio: 'ignore'
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      if (child.exitCode !== null) throw new Error('Server exited');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  const rows = html => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  function selected(html, filter, priority) {
    assert.match(html, new RegExp(`id="task-filter"[^>]*>\\s*(?:<option[^>]*>[^<]+</option>)*<option selected>${filter}</option>`));
    assert.match(html, new RegExp(`id="priority-filter"[^>]*>\\s*(?:<option[^>]*>[^<]+</option>)*<option selected>${priority}</option>`));
  }
  try {
    await start();
    await post('/projects', { name: 'Filters' });
    await post('/projects', { name: 'Other' });
    for (const title of ['First', 'Second', 'Third', 'Fourth']) {
      await post('/projects/1/tasks', { title });
    }
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/4/priority', { priority: 'High' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/3', { completed: '1' });
    const tasks = [
      { title: 'First', priority: 'High', completed: true },
      { title: 'Second', priority: 'Low', completed: false },
      { title: 'Third', priority: 'Normal', completed: true },
      { title: 'Fourth', priority: 'High', completed: false }
    ];
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(`/projects/1?filter=${filter}&priorityFilter=${priority}`);
        selected(html, filter, priority);
        assert.deepEqual(rows(html), tasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.title));
      }
    }
    let html = await get('/projects/1');
    selected(html, 'All', 'All');
    assert.match(html, /id="priority-filter"[^>]*>\s*<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    // Both selects share a GET form; every editing form carries both values.
    html = await get('/projects/1?filter=Open&priorityFilter=High');
    assert.match(html, /name="filter" value="Open"/);
    assert.match(html, /name="priorityFilter" value="High"/);
    const selection = { filter: 'Open', priorityFilter: 'High' };
    let response = await post('/projects/1/tasks/4/rename', { ...selection, title: '  Renamed  ' });
    assert.equal(response.headers.get('location'), '/projects/1?filter=Open&priorityFilter=High');
    html = await get(response.headers.get('location'));
    selected(html, 'Open', 'High');
    assert.deepEqual(rows(html), ['Renamed']);
    response = await post('/projects/1/tasks/4/rename', { ...selection, title: '  ' });
    html = await response.text();
    selected(html, 'Open', 'High');
    assert.match(html, /role="alert">Task title is required/);
    assert.deepEqual(rows(html), ['Renamed']);
    response = await post('/projects/1/tasks/4/priority', { ...selection, priority: 'Low' });
    html = await get(response.headers.get('location'));
    selected(html, 'Open', 'High');
    assert.deepEqual(rows(html), []);
    response = await post('/projects/1/tasks/1', { filter: 'Completed', priorityFilter: 'High' });
    html = await get(response.headers.get('location'));
    selected(html, 'Completed', 'High');
    assert.deepEqual(rows(html), []);
    assert.match(await get('/'), /project-summary">1\/4 completed/);
    assert.deepEqual(rows(await get('/projects/2')), []);
    await post('/projects/1/archive');
    html = await get('/projects/1?filter=Open&priorityFilter=Low');
    selected(html, 'Open', 'Low');
    assert.deepEqual(rows(html), ['Second', 'Renamed']);
    assert.match(html, /Archived project/);
    assert.equal((html.match(/id="task-priority-\d+" name="priority" disabled/g) || []).length, 2);
    response = await post('/projects/1/tasks/4/priority', { filter: 'Open', priorityFilter: 'Low', priority: 'High' });
    assert.equal(response.status, 403);
    selected(await response.text(), 'Open', 'Low');
    await stop();
    await start();
    assert.equal(await get('/projects/1?filter=Open&priorityFilter=Low'), html);
    await post('/projects/1/restore');
    html = await get('/projects/1?filter=Open&priorityFilter=Low');
    assert.deepEqual(rows(html), ['Second', 'Renamed']);
    assert.doesNotMatch(html, / disabled/);
    selected(await get('/projects/1'), 'All', 'All');
    assert.match(await get('/'), /project-summary">1\/4 completed/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
