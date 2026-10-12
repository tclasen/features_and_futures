import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const base = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
  });
  return { base, async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } };
}

const select = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>[\\s\\S]*?<\\/select>`))?.[0];
const titles = html => [...html.matchAll(/data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(match => match[1]);
function selected(html, filter, priorityFilter) {
  assert.match(select(html, 'task-filter'), new RegExp(`<option selected>${filter}</option>`));
  assert.match(select(html, 'priority-filter'), new RegExp(`<option selected>${priorityFilter}</option>`));
}

test('combined filters retain selections and re-evaluate edits, including archived projects and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  let server;
  try {
    server = await start(join(directory, 'db.sqlite'));
    const post = (path, fields = {}) => fetch(server.base + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    const get = async path => (await fetch(server.base + path)).text();
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    const tasks = [];
    for (const priority of ['Low', 'Normal', 'High']) {
      for (const completed of [false, true]) {
        const title = `${priority} ${completed ? 'done' : 'open'}`;
        await post('/projects/1/tasks', { title });
        const id = tasks.length + 1;
        await post(`/projects/1/tasks/${id}/priority`, { priority });
        if (completed) await post(`/projects/1/tasks/${id}`, { completed: '1' });
        tasks.push({ title, priority, completed });
      }
    }
    const initial = await get('/projects/1');
    selected(initial, 'All', 'All');
    assert.equal(select(initial, 'priority-filter').match(/<option[^>]*>/g).length, 4);
    assert.match(select(initial, 'priority-filter'), /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    // The two selects share a GET form, so either onchange submits both values.
    assert.match(initial, /<form method="get" action="\/projects\/1">[\s\S]*?id="task-filter"[\s\S]*?id="priority-filter"[\s\S]*?<\/form>/);
    const listing = await get('/');
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(`/projects/1?filter=${filter}&priorityFilter=${priorityFilter}`);
        selected(html, filter, priorityFilter);
        assert.deepEqual(titles(html), tasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priorityFilter === 'All' || task.priority === priorityFilter)).map(task => task.title));
        assert.equal(await get('/'), listing);
      }
    }
    assert.deepEqual(titles(await get('/projects/2?priorityFilter=High')), []);
    const fields = { filter: 'Open', priorityFilter: 'High' };
    const path = '/projects/1?filter=Open&priorityFilter=High';
    let detail = await get(path);
    // Every mutation form carries both currently selected filters.
    for (const form of detail.matchAll(/<form[^>]*method="post"[\s\S]*?<\/form>/g)) {
      assert.match(form[0], /name="filter" value="Open"/);
      assert.match(form[0], /name="priorityFilter" value="High"/);
    }
    let response = await post('/projects/1/tasks/5/rename', { ...fields, title: '  Renamed  ' });
    assert.equal(response.headers.get('location'), path);
    detail = await get(response.headers.get('location'));
    selected(detail, 'Open', 'High');
    assert.deepEqual(titles(detail), ['Renamed']);
    assert.match(detail, /aria-label="Complete Renamed"/);
    assert.match(select(detail, 'task-priority-5'), /<option selected>High/);
    assert.equal(await get('/'), listing);
    response = await post('/projects/1/tasks/5/rename', { ...fields, title: '   ' });
    assert.equal(response.status, 422);
    detail = await response.text();
    selected(detail, 'Open', 'High');
    assert.match(detail, /role="alert">Task title is required/);
    assert.deepEqual(titles(detail), ['Renamed']);
    response = await post('/projects/1/tasks/5/priority', { ...fields, priority: 'Low' });
    assert.equal(response.headers.get('location'), path);
    detail = await get(response.headers.get('location'));
    selected(detail, 'Open', 'High');
    assert.deepEqual(titles(detail), []);
    assert.equal(await get('/'), listing);
    response = await post('/projects/1/tasks/6', { filter: 'Completed', priorityFilter: 'High' });
    assert.equal(response.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=High');
    detail = await get(response.headers.get('location'));
    selected(detail, 'Completed', 'High');
    assert.deepEqual(titles(detail), []);
    assert.deepEqual(titles(await get(path)), ['High done']);
    assert.match(await get('/'), /2\/6 completed/);
    await server.stop();
    server = await start(join(directory, 'db.sqlite'));
    assert.equal(await get(response.headers.get('location')), detail);
    assert.deepEqual(titles(await get('/projects/1?filter=Open&priorityFilter=Low')), ['Low open', 'Renamed']);
    await post('/projects/1/archive');
    const archived = await get(path);
    selected(archived, 'Open', 'High');
    assert.deepEqual(titles(archived), ['High done']);
    assert.doesNotMatch(select(archived, 'task-filter'), /disabled/);
    assert.doesNotMatch(select(archived, 'priority-filter'), /disabled/);
    assert.match(select(archived, 'task-priority-6'), /disabled/);
    assert.match(archived, /aria-label="Complete High done" disabled/);
    assert.match(archived, /id="new-task-title-6"[^>]* disabled/);
    assert.match(archived, /disabled>Rename task/);
    for (const suffix of ['', '/rename', '/priority']) {
      response = await post(`/projects/1/tasks/6${suffix}`, { ...fields, title: 'Blocked', priority: 'Low', completed: '1' });
      assert.equal(response.status, 403);
      selected(await response.text(), 'Open', 'High');
    }
    await server.stop();
    server = await start(join(directory, 'db.sqlite'));
    assert.equal(await get(path), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(await get(path), / disabled/);
    assert.deepEqual(titles(await get('/projects/1?filter=Open&priorityFilter=Low')), ['Low open', 'Renamed']);
    selected(await get('/projects/1'), 'All', 'All');
    assert.match(await get('/'), /2\/6 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
