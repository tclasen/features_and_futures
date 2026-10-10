import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('search intersects filters and stays applied through edits, archive, moves and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timed out')), 5000);
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Exited ${code}`)));
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    base = `http://127.0.0.1:${port}`;
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const get = (path) => fetch(base + path).then((response) => response.text());
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', redirect: 'manual', body: new URLSearchParams(values),
  });
  const rows = (html, kind) => [...html.matchAll(new RegExp(`<article class="${kind}-row"[\\s\\S]*?</article>`, 'g'))].map((match) => match[0]);
  const titles = (html) => rows(html, 'task').map((row) => row.match(/<span>(.*?)<\/span>/)[1]);
  const names = (html) => rows(html, 'project').map((row) => row.match(/<h3>(.*?)<\/h3>/)[1]);
  const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01', search: 'ALPHA' };
  const path = (values = state) => `/projects/1?${new URLSearchParams(values)}`;
  const assertState = (html, expected = state) => {
    assert.match(html, new RegExp(`id="task-search"[^>]*value="${expected.search}"`));
    assert.match(html, new RegExp(`id="due-from"[^>]*value="${expected.dueFrom}"`));
    assert.match(html, new RegExp(`id="due-through"[^>]*value="${expected.dueThrough}"`));
    for (const [id, value] of [['task-filter', expected.filter], ['priority-filter', expected.priorityFilter]]) {
      assert.match(html.match(new RegExp(`<select id="${id}"[\\s\\S]*?</select>`))[0], new RegExp(`<option selected>${value}</option>`));
    }
    for (const form of html.matchAll(/<form[^>]*method="(?:post|get)"[\s\S]*?<\/form>/g)) {
      if (form[0].includes('>Projects</button>')) continue;
      assert.equal([...form[0].matchAll(/name="search"/g)].length, 1);
      for (const [key, value] of Object.entries(expected)) {
        assert.match(form[0], new RegExp(`name="${key}"[^>]*value="${value}"|name="${key}"[\\s\\S]*?<option selected>${value}</option>`));
      }
    }
  };
  async function edit(suffix, values, expectedTitles, status = 303) {
    const response = await post(`/projects/1/${suffix}`, { ...state, ...values });
    assert.equal(response.status, status);
    if (status === 303) assert.equal(new URL(response.headers.get('location'), base).searchParams.get('search'), state.search);
    const html = status === 303 ? await get(response.headers.get('location')) : await response.text();
    assertState(html);
    assert.deepEqual(titles(html), expectedTitles);
    return html;
  }
  try {
    await start();
    for (const name of ['Alpha  plan', 'ALPHA plan', 'Älpha', 'alpha archived', '<Alpha & "quote">']) await post('/projects', { name });
    await post('/projects/4/archive');
    assert.deepEqual(names(await get('/?search=%20aLpHa%20')), ['Alpha  plan', 'ALPHA plan', '&lt;Alpha &amp; &quot;quote&quot;&gt;']);
    assert.deepEqual(names(await get('/?search=alpha%20%20')), ['Alpha  plan', 'ALPHA plan', '&lt;Alpha &amp; &quot;quote&quot;&gt;']); // trailing whitespace is trimmed
    assert.deepEqual(names(await get('/?search=alpha%20%20plan')), ['Alpha  plan']);
    assert.deepEqual(names(await get('/?search=%C3%A4lpha')), []); // Unicode case is significant
    assert.deepEqual(names(await get('/?filter=Archived&search=ALPHA')), ['alpha archived']);
    assert.equal(names(await get('/?search=%20%09%20')).length, 4);
    const list = await get('/?search=ALPHA');
    assert.match(list, /id="project-search" name="search" type="text" value="ALPHA"/);
    assert.match(list, /<form action="\/" method="get" class="filter-form">\s*<input type="hidden" name="search" value="ALPHA">/);
    const restored = await post('/projects/4/restore', { search: 'ALPHA' });
    assert.equal(restored.headers.get('location'), '/?filter=Archived&search=ALPHA');
    await post('/projects/4/archive');
    for (const title of ['Alpha first', 'beta', 'aLPHA  spaced', 'alpha completed', 'alpha low', 'alpha undated']) await post('/projects/1/tasks', { title });
    for (let id = 1; id <= 6; id++) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: id === 5 ? 'Low' : 'High' });
      if (id !== 6) await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-02-29' });
    }
    await post('/projects/1/tasks/4/completion', { completed: '1' });
    assert.deepEqual(titles(await get(path())), ['Alpha first', 'aLPHA  spaced']);
    assertState(await get(path()));
    assert.deepEqual(titles(await get(path({ ...state, search: '  ALPHA  spaced  ' }))), ['aLPHA  spaced']);
    assert.deepEqual(titles(await get(path({ ...state, search: '' }))), ['Alpha first', 'beta', 'aLPHA  spaced']);
    assert.deepEqual(titles(await get(path({ ...state, filter: 'Completed' }))), ['alpha completed']);
    assert.deepEqual(titles(await get(path({ ...state, priorityFilter: 'Low' }))), ['alpha low']);
    assert.deepEqual(titles(await get(path({ ...state, dueFrom: '', dueThrough: '' }))), ['Alpha first', 'aLPHA  spaced', 'alpha undated']);
    const summary = await get('/');
    assert.match(summary, /1\/6 completed/);
    await edit('tasks/1/rename', { title: 'No match' }, ['aLPHA  spaced']);
    await edit('tasks/3/rename', { title: '  Alpha renamed  ' }, ['Alpha renamed']);
    await edit('tasks/3/rename', { title: '   ' }, ['Alpha renamed'], 422);
    await edit('tasks/3/due-date', { dueDate: '2024-03-02' }, []);
    await edit('tasks/3/due-date', { dueDate: '2024-03-01' }, ['Alpha renamed']);
    await edit('tasks/3/priority', { priority: 'Normal' }, []);
    await edit('tasks/3/priority', { priority: 'High' }, ['Alpha renamed']);
    await edit('tasks/3/completion', { completed: '1' }, []);
    await edit('tasks/3/completion', {}, ['Alpha renamed']);
    await edit('due-range', { rangeFrom: 'bad', rangeThrough: '' }, ['Alpha renamed'], 422);
    await edit('due-range', { rangeFrom: state.dueFrom, rangeThrough: state.dueThrough }, ['Alpha renamed']);
    await edit('rename', { name: 'Search project renamed' }, ['Alpha renamed']);
    await edit('default-priority', { priority: 'Low' }, ['Alpha renamed']);
    await edit('tasks', { title: 'Alpha created' }, ['Alpha renamed']);
    await edit('tasks/3/move', { destinationProject: '2' }, []);
    assert.deepEqual(titles(await get('/projects/2?search=ALPHA')), ['Alpha renamed']);
    await post('/projects/2/tasks/3/move', { destinationProject: '1', search: 'ALPHA' });
    assert.deepEqual(titles(await get(path())), ['Alpha renamed']);
    assert.deepEqual(titles(await get('/projects/1')), ['No match', 'beta', 'Alpha renamed', 'alpha completed', 'alpha low', 'alpha undated', 'Alpha created']);
    const saved = await get(path());
    await stop();
    await start();
    assert.equal(await get(path()), saved);
    await post('/projects/1/archive');
    const archived = await get(path());
    assertState(archived);
    assert.match(archived, /Archived project/);
    for (const row of rows(archived, 'task')) {
      assert.match(row, /type="checkbox"[\s\S]*?disabled/);
      assert.match(row, /name="title"[^>]*disabled/);
      assert.match(row, /name="priority"[^>]*disabled/);
      assert.match(row, /name="dueDate"[^>]*disabled/);
      assert.match(row, /name="destinationProject"[^>]*disabled/);
    }
    assert.deepEqual(titles(await get(path({ ...state, search: 'beta' }))), ['beta']);
    await edit('tasks/3/rename', { title: 'blocked' }, ['Alpha renamed'], 403);
    await post('/projects/1/restore');
    assert.equal(await get(path()), saved);
    const reset = await get('/projects/1');
    assert.match(reset, /id="task-search"[^>]*value=""/);
    assert.match(reset, /<form action="\/" method="get"><button class="secondary">Projects<\/button><\/form>/);
    assert.match(await get('/'), /id="project-search"[^>]*value=""/);
    assert.match(summary, /1\/6 completed/);
    assert.match(await get('/'), /1\/7 completed/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
