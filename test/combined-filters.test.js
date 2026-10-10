import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('combined filters retain selections through edits, archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(match[1]);
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const titles = html => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const selected = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1].match(/<option selected>([^<]+)</)[1];
  try {
    await start();
    await post('/projects', { name: 'First' });
    for (const title of ['Low open', 'Normal open', 'High open', 'Low done', 'Normal done', 'High done']) {
      await post('/projects/1/tasks', { title });
    }
    for (const id of [1, 4]) await post(`/projects/1/tasks/${id}/priority`, { priority: 'Low' });
    for (const id of [3, 6]) await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
    for (const id of [4, 5, 6]) await post(`/projects/1/tasks/${id}`, { completed: '1' });
    const summary = await get('/');
    assert.match(summary, /3\/6 completed/);
    const allTitles = ['Low open', 'Normal open', 'High open', 'Low done', 'Normal done', 'High done'];
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(`/projects/1?filter=${filter}&priorityFilter=${priorityFilter}`);
        assert.equal(selected(html, 'task-filter'), filter);
        assert.equal(selected(html, 'priority-filter'), priorityFilter);
        assert.deepEqual(titles(html), allTitles.filter((title, i) =>
          (filter === 'All' || (i >= 3) === (filter === 'Completed')) &&
          (priorityFilter === 'All' || title.startsWith(priorityFilter))));
      }
    }
    const state = { filter: 'Open', priorityFilter: 'High' };
    const path = '/projects/1?filter=Open&priorityFilter=High';
    let html = await get(path);
    assert.match(html, /<option selected>High<\/option>/);
    assert.match(html, /name="priorityFilter" value="High"/);
    const rename = await post('/projects/1/tasks/3/rename', { ...state, title: ' Renamed ' });
    assert.equal(rename.headers.get('location'), path);
    assert.deepEqual(titles(await get(path)), ['Renamed']);
    const invalid = await post('/projects/1/tasks/3/rename', { ...state, title: ' ' });
    html = await invalid.text();
    assert.match(html, /Task title is required/);
    assert.equal(selected(html, 'task-filter'), 'Open');
    assert.equal(selected(html, 'priority-filter'), 'High');
    const changed = await post('/projects/1/tasks/3/priority', { ...state, priority: 'Low' });
    assert.equal(changed.headers.get('location'), path);
    assert.deepEqual(titles(await get(path)), []);
    assert.equal(await get('/'), summary);
    await post('/projects/1/tasks/3/priority', { ...state, priority: 'High' });
    const completed = await post('/projects/1/tasks/3', { ...state, completed: '1' });
    assert.equal(completed.headers.get('location'), path);
    assert.deepEqual(titles(await get(path)), []);
    assert.deepEqual(titles(await get('/projects/1?filter=Completed&priorityFilter=High')), ['Renamed', 'High done']);
    await post('/projects/1/archive');
    html = await get('/projects/1?filter=Completed&priorityFilter=High');
    assert.deepEqual(titles(html), ['Renamed', 'High done']);
    assert.doesNotMatch(html, /id="(?:task-filter|priority-filter)"[^>]*disabled/);
    assert.match(html, /id="task-priority-3" name="priority" disabled/);
    await stop();
    await start();
    assert.equal(await get('/projects/1?filter=Completed&priorityFilter=High'), html);
    await post('/projects/1/restore');
    assert.deepEqual(titles(await get('/projects/1?filter=Completed&priorityFilter=High')), ['Renamed', 'High done']);
    const initial = await get('/projects/1');
    assert.equal(selected(initial, 'task-filter'), 'All');
    assert.equal(selected(initial, 'priority-filter'), 'All');
    assert.match(initial, /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    assert.match(await get('/'), /4\/6 completed/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
