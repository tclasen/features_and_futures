import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('combined filters preserve selections, order, edits, archive behavior and persisted data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  let child;
  let base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Server exited ${code}`)));
      child.stdout.on('data', (data) => {
        const match = String(data).match(/port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  };
  const stop = async () => {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
    child = null;
  };
  const get = async (path) => (await fetch(base + path)).text();
  const post = (path, data = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
  });
  const titles = (html) => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map((match) => match[1]);
  const selections = (html, completion, priority) => {
    for (const [id, value] of [['task-filter', completion], ['priority-filter', priority]]) {
      const select = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`));
      assert.ok(select);
      assert.match(select[1], new RegExp(`<option selected>${value}</option>`));
      assert.doesNotMatch(select[0], /disabled/);
    }
  };
  try {
    await start();
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    for (const title of ['A', 'B', 'C', 'D']) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/4/priority', { priority: 'High' });
    await post('/projects/1/tasks/1', { completed: '1' });
    await post('/projects/1/tasks/3', { completed: '1' });
    const tasks = [['A', 'High', true], ['B', 'Low', false], ['C', 'Normal', true], ['D', 'High', false]];
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(`/projects/1?filter=${completion}&priorityFilter=${priority}`);
        selections(html, completion, priority);
        assert.deepEqual(titles(html), tasks.filter(([, p, done]) =>
          (completion === 'All' || done === (completion === 'Completed')) &&
          (priority === 'All' || p === priority)).map(([title]) => title));
      }
    }
    selections(await get('/projects/1'), 'All', 'All');
    const filters = { filter: 'Open', priorityFilter: 'High' };
    const location = '/projects/1?filter=Open&priorityFilter=High';
    let response = await post('/projects/1/tasks/4/rename', { ...filters, title: '  Renamed  ' });
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual(titles(await get(location)), ['Renamed']);
    response = await post('/projects/1/tasks/4/rename', { ...filters, title: ' ' });
    const error = await response.text();
    selections(error, 'Open', 'High');
    assert.match(error, /Task title is required/);
    response = await post('/projects/1/tasks/4/priority', { ...filters, priority: 'Low' });
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual(titles(await get(location)), []);
    response = await post('/projects/1/tasks/1', { filter: 'Completed', priorityFilter: 'High' });
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High');
    assert.deepEqual(titles(await get('/projects/1?filter=Completed&priorityFilter=High')), []);
    assert.deepEqual(titles(await get(location)), ['A']);
    assert.match(await get('/'), /project-summary">1\/4 completed/);
    assert.deepEqual(titles(await get('/projects/2')), []);
    await post('/projects/1/archive');
    const archived = await get(location);
    selections(archived, 'Open', 'High');
    assert.match(archived, /Archived project/);
    assert.match(archived, /name="completed"[^>]* disabled/);
    assert.match(archived, /id="task-priority-1"[^>]* disabled/);
    assert.match(archived, /id="new-task-title-1"[^>]* disabled/);
    await stop();
    await start();
    assert.equal(await get(location), archived);
    await post('/projects/1/restore');
    assert.deepEqual(titles(await get(location)), ['A']);
    const restored = await get('/projects/1?priorityFilter=Low');
    assert.deepEqual(titles(restored), ['B', 'Renamed']);
    assert.doesNotMatch(restored, /<(?:input|select|button)\b[^>]* disabled/);
    assert.match(await get('/'), /project-summary">1\/4 completed/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
