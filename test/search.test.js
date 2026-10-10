import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchesSearch } from '../search.js';
import { openProjectStore } from '../projects.js';

test('search trims boundaries, folds only ASCII and preserves internal whitespace', () => {
  assert.equal(matchesSearch('Alpha  BETA', '  HA  be  '), true);
  assert.equal(matchesSearch('Alpha  BETA', 'alpha beta'), false);
  assert.equal(matchesSearch('ÄBC', 'äbc'), false);
  assert.equal(matchesSearch('ÄBC', 'Äbc'), true);
  assert.equal(matchesSearch('Anything', ' \t '), true);
  assert.equal(matchesSearch('<&"', '<&"'), true);
});

function titles(html, kind) {
  return [...html.matchAll(new RegExp(`<li data-testid="${kind}-row">([\\s\\S]*?)<\\/li>`, 'g'))]
    .map((row) => /<span>(.*?)<\/span>/.exec(row[1])[1]);
}

test('HTTP searches intersect filters, survive edits and reset on navigation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const db = join(directory, 'app.sqlite');
  const store = openProjectStore(db);
  const first = store.create('Alpha  Team');
  const second = store.create('ALPHA other');
  store.setArchived(second, true);
  const task = store.createTask(first, 'Build  API');
  store.setTaskPriority(first, task, 'High');
  store.setTaskDueDate(first, task, '2025-01-02');
  store.createTask(first, 'Build UI');
  store.createTask(first, 'Other API');
  store.close();
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: db }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Startup timed out')), 5000);
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = /listening on port (\d+)/.exec(output);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.once('error', reject);
    });
    const base = `http://127.0.0.1:${port}`;
    const get = async (path) => (await fetch(base + path)).text();
    const post = (path, fields) => fetch(base + path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    assert.deepEqual(titles(await get('/?search=+alpha+'), 'project'), ['Alpha  Team']);
    assert.deepEqual(titles(await get('/?search=alpha&filter=Archived'), 'project'), ['ALPHA other']);
    assert.deepEqual(titles(await get('/?search=alpha+team'), 'project'), []);
    const path = `/projects/${first}`;
    const state = { search: '  BUILD  ', filter: 'Open', priorityFilter: 'High', dueFrom: '2025-01-02', dueThrough: '2025-01-02' };
    const query = new URLSearchParams(state);
    let html = await get(`${path}?${query}`);
    assert.deepEqual(titles(html, 'task'), ['Build  API']);
    assert.match(html, /name="search" value="BUILD"/);
    assert.match(html, /<label for="task-search">Task search<\/label>/);
    let response = await post(`${path}/tasks/${task}/rename`, { ...state, title: '  BUILD service  ' });
    let location = response.headers.get('location');
    assert.equal(new URL(location, base).searchParams.get('search'), 'BUILD');
    assert.equal(new URL(location, base).searchParams.get('dueFrom'), '2025-01-02');
    assert.deepEqual(titles(await get(location), 'task'), ['BUILD service']);
    response = await post(`${path}/tasks/${task}/completion`, { ...state, completed: '1' });
    assert.deepEqual(titles(await get(response.headers.get('location')), 'task'), []);
    const invalid = await get(`${path}?${query}&applyRange=1&rangeFrom=invalid`);
    assert.match(invalid, /role="alert"/);
    assert.match(invalid, /name="search" value="BUILD"/);
    assert.deepEqual(titles(await get(path), 'task'), ['BUILD service', 'Build UI', 'Other API']);
    assert.match(await get('/'), /id="project-search" name="search" type="text" value=""/);
    await post(`${path}/archive`, {});
    html = await get(`${path}?search=build`);
    assert.deepEqual(titles(html, 'task'), ['BUILD service', 'Build UI']);
    assert.match(html, /Archived project/);
    assert.doesNotMatch(html, /id="task-search"[^>]*disabled/);
  } finally {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
