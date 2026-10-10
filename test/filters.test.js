import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('combined filters preserve selections, re-evaluate edits, and work after archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Unexpected exit ${code}`)));
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const page = async path => (await fetch(base + path)).text();
  const titles = html => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const selection = (html, id, value) => assert.match(html.match(new RegExp(`<select id="${id}"[^>]*>[\\s\\S]*?<\\/select>`))[0], new RegExp(`<option selected>${value}<`));
  try {
    await start();
    await post('/projects', { name: 'Example' });
    for (const title of ['First', 'Second', 'Third', 'Fourth']) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/4/priority', { priority: 'High' });
    await post('/projects/1/tasks/2', { completed: 'on' });
    await post('/projects/1/tasks/4', { completed: 'on' });
    const all = await page('/projects/1');
    selection(all, 'priority-filter', 'All');
    assert.match(all, /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    const tasks = [
      { title: 'First', priority: 'High', completed: false },
      { title: 'Second', priority: 'Low', completed: true },
      { title: 'Third', priority: 'Normal', completed: false },
      { title: 'Fourth', priority: 'High', completed: true },
    ];
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await page(`/projects/1?filter=${filter}&priorityFilter=${priority}`);
        assert.deepEqual(titles(html), tasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.title));
        selection(html, 'task-filter', filter);
        selection(html, 'priority-filter', priority);
      }
    }
    const query = '?filter=Open&priorityFilter=High';
    let response = await post('/projects/1/tasks/1/rename' + query, { title: ' Renamed ' });
    assert.equal(response.headers.get('location'), '/projects/1' + query);
    let html = await page(response.headers.get('location'));
    assert.deepEqual(titles(html), ['Renamed']);
    selection(html, 'task-filter', 'Open');
    selection(html, 'priority-filter', 'High');
    assert.match(html, /\/tasks\/1\/priority\?filter=Open&amp;priorityFilter=High/);
    response = await post('/projects/1/tasks/1/rename' + query, { title: ' ' });
    html = await response.text();
    assert.match(html, /Task title is required/);
    selection(html, 'priority-filter', 'High');
    response = await post('/projects/1/tasks/1/priority' + query, { priority: 'Normal' });
    assert.deepEqual(titles(await page(response.headers.get('location'))), []);
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    response = await post('/projects/1/tasks/1' + query, { completed: 'on' });
    assert.deepEqual(titles(await page(response.headers.get('location'))), []);
    assert.match(await page('/'), /3\/4 completed/);
    await post('/projects/1/archive');
    html = await page('/projects/1?filter=Completed&priorityFilter=High');
    assert.deepEqual(titles(html), ['Renamed', 'Fourth']);
    for (const id of ['task-filter', 'priority-filter']) {
      assert.doesNotMatch(html.match(new RegExp(`<select id="${id}"[^>]*>`))[0], /disabled/);
    }
    assert.match(html, /id="task-priority-1" name="priority" disabled/);
    await stop();
    await start();
    assert.deepEqual(titles(await page('/projects/1?filter=Completed&priorityFilter=High')), ['Renamed', 'Fourth']);
    await post('/projects/1/restore');
    html = await page('/projects/1');
    assert.doesNotMatch(html, / disabled/);
    selection(html, 'priority-filter', 'All');
    assert.match(html, /aria-label="Complete Renamed" checked/);
    assert.match(await page('/'), /3\/4 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
