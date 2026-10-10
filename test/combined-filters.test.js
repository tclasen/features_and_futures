import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('combined filters retain selections through edits, archives and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  const port = 50000 + Math.floor(Math.random() * 10000);
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
  const path = (filter, priority) => `/projects/1?filter=${filter}&priorityFilter=${priority}`;
  function rows(html) {
    return [...html.matchAll(/<label for="task-\d+">([^<]*)<\/label>/g)].map(match => match[1]);
  }
  function selections(html, filter, priority) {
    for (const [id, value, options] of [
      ['task-filter', filter, ['All', 'Open', 'Completed']],
      ['priority-filter', priority, ['All', 'Low', 'Normal', 'High']],
    ]) {
      assert.match(html, new RegExp(`<select id="${id}"[^>]*>\\s*${options.map(option => `<option${option === value ? ' selected' : ''}>${option}</option>`).join('')}\\s*</select>`));
    }
  }
  try {
    await start();
    await post('/projects', { name: 'Filters' });
    for (const title of ['A', 'B', 'C', 'D']) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/4/priority', { priority: 'High' });
    await post('/projects/1/tasks/2', { completed: '1' });
    await post('/projects/1/tasks/4', { completed: '1' });
    const tasks = [
      { title: 'A', priority: 'High', completed: false },
      { title: 'B', priority: 'Low', completed: true },
      { title: 'C', priority: 'Normal', completed: false },
      { title: 'D', priority: 'High', completed: true },
    ];
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(path(filter, priority));
        selections(html, filter, priority);
        assert.deepEqual(rows(html), tasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.title));
      }
    }
    selections(await get('/projects/1'), 'All', 'All');
    const selected = { filter: 'Open', priorityFilter: 'High' };
    let response = await post('/projects/1/tasks/1/rename', { ...selected, title: ' Renamed ' });
    assert.equal(response.headers.get('location'), path('Open', 'High'));
    let html = await get(response.headers.get('location'));
    selections(html, 'Open', 'High');
    assert.deepEqual(rows(html), ['Renamed']);
    assert.match(html, /aria-label="Complete Renamed"/);
    response = await post('/projects/1/tasks/1/rename', { ...selected, title: '  ' });
    assert.equal(response.status, 400);
    html = await response.text();
    selections(html, 'Open', 'High');
    assert.match(html, /Task title is required/);
    assert.deepEqual(rows(html), ['Renamed']);
    response = await post('/projects/1/tasks/1', { ...selected, completed: '1' });
    assert.equal(response.headers.get('location'), path('Open', 'High'));
    assert.deepEqual(rows(await get(response.headers.get('location'))), []);
    response = await post('/projects/1/tasks/4/priority', {
      filter: 'Completed', priorityFilter: 'High', priority: 'Low',
    });
    assert.equal(response.headers.get('location'), path('Completed', 'High'));
    html = await get(response.headers.get('location'));
    selections(html, 'Completed', 'High');
    assert.deepEqual(rows(html), ['Renamed']);
    assert.match(await get('/'), /data-testid="project-summary">3\/4 completed/);
    await post('/projects/1/archive');
    html = await get(path('Completed', 'Low'));
    selections(html, 'Completed', 'Low');
    assert.deepEqual(rows(html), ['B', 'D']);
    assert.doesNotMatch(html, /id="(?:task-filter|priority-filter)"[^>]*disabled/);
    assert.equal((html.match(/id="task-priority-\d+" name="priority" disabled/g) || []).length, 2);
    await stop();
    await start();
    assert.equal(await get(path('Completed', 'Low')), html);
    await post('/projects/1/restore');
    assert.deepEqual(rows(await get(path('Completed', 'Low'))), ['B', 'D']);
    assert.deepEqual(rows(await get(path('Completed', 'High'))), ['Renamed']);
    assert.match(await get('/'), /data-testid="project-summary">3\/4 completed/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
