import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('combined filters preserve selections through edits, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    base = await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = /listening on port (\d+)/.exec(output);
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
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const titles = html => [...html.matchAll(/<span>(.*?)<\/span>/g)].map(match => match[1]);
  const selected = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1].match(/<option selected>(.*?)<\/option>/)[1];
  try {
    await start();
    await post('/projects', { name: 'Filters' });
    for (const title of ['Low open', 'Normal open', 'High open', 'Low done', 'Normal done', 'High done']) {
      await post('/projects/1/tasks', { title });
    }
    for (const id of [1, 4]) await post(`/projects/1/tasks/${id}/priority`, { priority: 'Low' });
    for (const id of [3, 6]) await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
    for (const id of [4, 5, 6]) await post(`/projects/1/tasks/${id}/completion`, { completed: '1' });
    const summary = await get('/');
    const initial = await get('/projects/1');
    assert.equal(selected(initial, 'priority-filter'), 'All');
    assert.match(initial, /<select id="priority-filter"[^>]*>\s*<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(`/projects/1?filter=${filter}&priorityFilter=${priority}`);
        const expected = ['Low open', 'Normal open', 'High open', 'Low done', 'Normal done', 'High done'].filter(title =>
          (filter === 'All' || title.endsWith(filter === 'Open' ? 'open' : 'done')) &&
          (priority === 'All' || title.startsWith(priority)));
        assert.deepEqual(titles(html), expected);
        assert.equal(selected(html, 'task-filter'), filter);
        assert.equal(selected(html, 'priority-filter'), priority);
      }
    }
    assert.equal(await get('/'), summary);
    const filters = { filter: 'Open', priorityFilter: 'High' };
    const location = '/projects/1?filter=Open&priorityFilter=High';
    let response = await post('/projects/1/tasks/3/rename', { ...filters, title: '  Renamed  ' });
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual(titles(await get(location)), ['Renamed']);
    for (const endpoint of ['/projects/1/tasks/3/rename', '/projects/1/tasks', '/projects/1/rename']) {
      response = await post(endpoint, { ...filters, title: ' ', name: ' ' });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.equal(selected(html, 'task-filter'), 'Open');
      assert.equal(selected(html, 'priority-filter'), 'High');
      assert.deepEqual(titles(html), ['Renamed']);
    }
    response = await post('/projects/1/tasks/3/priority', { ...filters, priority: 'Low' });
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual(titles(await get(location)), []);
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks/3/priority', { ...filters, priority: 'High' });
    response = await post('/projects/1/tasks/3/completion', { ...filters, completed: '1' });
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual(titles(await get(location)), []);
    const completedUrl = '/projects/1?filter=Completed&priorityFilter=High';
    const completed = await get(completedUrl);
    assert.deepEqual(titles(completed), ['Renamed', 'High done']);
    await stop();
    await start();
    assert.equal(await get(completedUrl), completed);
    await post('/projects/1/archive');
    const archived = await get(completedUrl);
    assert.deepEqual(titles(archived), ['Renamed', 'High done']);
    for (const id of ['task-filter', 'priority-filter']) {
      assert.doesNotMatch(archived.match(new RegExp(`<select id="${id}"[^>]*>`))[0], /disabled/);
    }
    assert.match(archived, /id="task-priority-3"[^>]* disabled/);
    assert.match(archived, /id="new-task-title-3"[^>]* disabled/);
    await post('/projects/1/restore');
    assert.equal(await get(completedUrl), completed);
    assert.equal(selected(await get('/projects/1'), 'priority-filter'), 'All');
    assert.match(await get('/'), /4\/6 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
