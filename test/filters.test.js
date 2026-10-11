import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('combined filters preserve selections through edits, errors, archives and restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(dir, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'inherit']
    });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill(); await exited; child = null; }
  const html = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  const rows = text => [...text.matchAll(/aria-label="Complete ([^"]+)"/g)].map(match => match[1]);
  const selected = (text, id) => text.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1].match(/<option selected>([^<]+)/)[1];
  try {
    await start();
    await post('/projects', { name: 'Filters' });
    for (const title of ['First', 'Second', 'Third', 'Fourth']) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/priority', { priority: 'Low' });
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    await post('/projects/1/tasks/3', { completed: '1' });
    const priorities = { All: ['First', 'Second', 'Third', 'Fourth'], Low: ['Second'], Normal: ['Fourth'], High: ['First', 'Third'] };
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priorityFilter of Object.keys(priorities)) {
        const text = await html(`/projects/1?filter=${filter}&priorityFilter=${priorityFilter}`);
        assert.deepEqual(rows(text), priorities[priorityFilter].filter(title => filter === 'All' || (title === 'Third') === (filter === 'Completed')));
        assert.equal(selected(text, 'task-filter'), filter);
        assert.equal(selected(text, 'priority-filter'), priorityFilter);
      }
    }
    const values = { filter: 'Open', priorityFilter: 'High' };
    let response = await post('/projects/1/tasks/1/rename', { ...values, title: ' Renamed ' });
    assert.equal(response.headers.get('location'), '/projects/1?filter=Open&priorityFilter=High');
    let text = await html(response.headers.get('location'));
    assert.deepEqual(rows(text), ['Renamed']);
    assert.equal(selected(text, 'task-filter'), 'Open');
    assert.equal(selected(text, 'priority-filter'), 'High');
    assert.equal((text.match(/name="priorityFilter" value="High"/g) || []).length, 11);
    for (const [path, input, message] of [
      ['/projects/1/tasks/1/rename', { title: ' ' }, 'Task title is required'],
      ['/projects/1/tasks', { title: ' ' }, 'Task title is required'],
      ['/projects/1/rename', { name: ' ' }, 'Project name is required']
    ]) {
      text = await (await post(path, { ...values, ...input })).text();
      assert.ok(text.includes(message));
      assert.equal(selected(text, 'task-filter'), 'Open');
      assert.equal(selected(text, 'priority-filter'), 'High');
    }
    response = await post('/projects/1/tasks/1', { ...values, completed: '1' });
    assert.deepEqual(rows(await html(response.headers.get('location'))), []);
    response = await post('/projects/1/tasks/3/priority', { filter: 'Completed', priorityFilter: 'High', priority: 'Low' });
    assert.deepEqual(rows(await html(response.headers.get('location'))), ['Renamed']);
    assert.match(await html('/'), /2\/4 completed/);
    await post('/projects/1/archive');
    text = await html('/projects/1?filter=Completed&priorityFilter=Low');
    assert.deepEqual(rows(text), ['Third']);
    assert.match(text, /name="priority" disabled/);
    assert.doesNotMatch(text, /id="(?:task-filter|priority-filter)"[^>]*disabled/);
    await stop();
    await start();
    assert.deepEqual(rows(await html('/projects/1?filter=Completed&priorityFilter=Low')), ['Third']);
    await post('/projects/1/restore');
    text = await html('/projects/1');
    assert.equal(selected(text, 'priority-filter'), 'All');
    assert.deepEqual(rows(text), ['Renamed', 'Second', 'Third', 'Fourth']);
    assert.doesNotMatch(text, /<(?:input|select)[^>]*name="(?:completed|priority|title|due_date)"[^>]* disabled/);
    assert.match(text, /name="destination" disabled/); // No other active projects exist.
    assert.match(await html('/'), /2\/4 completed/);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
