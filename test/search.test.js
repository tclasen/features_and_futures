import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    child.once('exit', code => reject(new Error(`Server exited ${code}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.stderr.on('data', () => {});
  });
  return { url, stop: () => new Promise(resolve => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
  }) };
}

const rowNames = (html, type) => [...html.matchAll(new RegExp(`<li data-testid="${type}-row">\\s*<span>(.*?)<\\/span>`, 'g'))].map(match => match[1]);

test('search composes with filters, folds only ASCII, retains edit state, and resets on navigation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, data = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const list = query => get(`/?${new URLSearchParams(query)}`);
    for (const name of ['Alpha One', 'ALPHA  Two', 'Beta', 'Älpha']) await post('/projects', { name });
    await post('/projects/2/archive');
    assert.deepEqual(rowNames(await list({ search: '  ALPHA  ' }), 'project'), ['Alpha One']);
    assert.deepEqual(rowNames(await list({ filter: 'Archived', search: 'alpha' }), 'project'), ['ALPHA  Two']);
    assert.deepEqual(rowNames(await list({ filter: 'Archived', search: 'alpha two' }), 'project'), ['ALPHA  Two']);
    assert.deepEqual(rowNames(await list({ search: 'älpha' }), 'project'), []);
    assert.deepEqual(rowNames(await list({ search: '   ' }), 'project'), ['Alpha One', 'Beta', 'Älpha']);
    let html = await list({ search: 'alpha' });
    assert.match(html, /id="project-search" name="search" type="text" value="alpha"/);
    assert.match(html, /action="\/projects\/1" method="get">\s*<button/);
    assert.match(html, /action="\/" method="get" class="filter-form">\s*<input type="hidden" name="search" value="alpha"/);
    for (const title of ['Alpha first', 'alpha  second', 'Beta', 'ÄLPHA']) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/2/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' });
    await post('/projects/1/tasks/2/due-date', { dueDate: '2024-03-01' });
    await post('/projects/1/tasks/1', { completed: '1' });
    const state = { search: 'alpha', filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const path = () => `/projects/1?${new URLSearchParams(state)}`;
    html = await get(path());
    assert.deepEqual(rowNames(html, 'task'), ['Alpha first']);
    for (const form of html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)) {
      if (!form[0].includes('action="/"')) {
        assert.match(form[0], /name="search"[^>]*value="alpha"/);
        assert.match(form[0], /name="dueFrom" value="2024-02-29"/);
      }
    }
    assert.deepEqual(rowNames(await get('/projects/1?search=alpha%20second'), 'task'), ['alpha  second']);
    assert.deepEqual(rowNames(await get('/projects/1?search=%C3%A4lpha'), 'task'), []);
    assert.deepEqual(rowNames(await get('/projects/1?search=alpha'), 'task'), ['Alpha first', 'alpha  second']);
    const apply = await fetch(`${server.url}/projects/1/due-range?${new URLSearchParams({ ...state, from: '2024-02-29', through: '2024-02-29' })}`, { redirect: 'manual' });
    assert.equal(new URL(apply.headers.get('location'), server.url).searchParams.get('search'), 'alpha');
    const invalid = await fetch(`${server.url}/projects/1/due-range?${new URLSearchParams({ ...state, from: '2023-02-29' })}`);
    assert.equal(invalid.status, 422);
    assert.deepEqual(rowNames(await invalid.text(), 'task'), ['Alpha first']);
    const edit = async (route, data, expected) => {
      const response = await post(route, { ...state, ...data });
      assert.equal(response.status, 303);
      const params = new URL(response.headers.get('location'), server.url).searchParams;
      for (const [key, value] of Object.entries(state)) assert.equal(params.get(key), value);
      assert.deepEqual(rowNames(await get(response.headers.get('location')), 'task'), expected);
    };
    await edit('/projects/1/tasks/1/rename', { title: 'No match' }, []);
    await edit('/projects/1/tasks/1/rename', { title: 'Alpha renamed' }, ['Alpha renamed']);
    await edit('/projects/1/tasks/1/priority', { priority: 'Low' }, []);
    await edit('/projects/1/tasks/1/priority', { priority: 'High' }, ['Alpha renamed']);
    await edit('/projects/1/tasks/1/due-date', { dueDate: '' }, []);
    await edit('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' }, ['Alpha renamed']);
    await edit('/projects/1/tasks/1', { completed: '' }, []);
    await edit('/projects/1/tasks/1', { completed: '1' }, ['Alpha renamed']);
    await edit('/projects/1/rename', { name: 'Renamed project' }, ['Alpha renamed']);
    await edit('/projects/1/default-priority', { priority: 'Low' }, ['Alpha renamed']);
    await edit('/projects/1/tasks', { title: 'Alpha new' }, ['Alpha renamed']);
    await edit('/projects/1/tasks/1/move', { destination: '3' }, []);
    await post('/projects/3/tasks/1/move', { destination: '1' });
    assert.deepEqual(rowNames(await get(path()), 'task'), ['Alpha renamed']);
    assert.match(await get('/'), /data-testid="project-summary">1\/5 completed/);
    await post('/projects/1/archive');
    html = await get(path());
    assert.match(html, /id="task-search" name="search" type="text" value="alpha"/);
    assert.match(html, /id="task-priority-1"[^>]*disabled/);
    assert.deepEqual(rowNames(html, 'task'), ['Alpha renamed']);
    assert.deepEqual(rowNames(await get('/projects/1?search=Beta'), 'task'), ['Beta']);
    await post('/projects/1/restore');
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(rowNames(await get(path()), 'task'), ['Alpha renamed']);
    html = await get('/projects/1');
    assert.match(html, /id="task-search" name="search" type="text" value=""/);
    assert.deepEqual(rowNames(html, 'task'), ['Alpha renamed', 'alpha  second', 'Beta', 'ÄLPHA', 'Alpha new']);
    assert.match(html, /action="\/" method="get"><button type="submit">Projects/);
    assert.match(await get('/'), /id="project-search" name="search" type="text" value=""/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('spaces and tabs normalize only for matching, including after restart and archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-spaces-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await start(databasePath);
    const get = async path => (await fetch(server.url + path)).text();
    const post = (path, data = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const projectName = 'AlPhA \t  Team';
    const title = 'FiRsT\t \t  Task';
    await post('/projects', { name: projectName });
    await post('/projects/1/tasks', { title });
    // Other internal whitespace and non-ASCII case must not normalize.
    await post('/projects', { name: 'Alpha\u00a0Team' });
    await post('/projects/1/tasks', { title: 'First\u00a0Task' });
    const listPath = '/?' + new URLSearchParams({ search: ' \tALPHA\t \tTEAM  ' });
    const taskPath = '/projects/1?' + new URLSearchParams({ search: '  FIRST  \tTASK\t ' });
    const check = async () => {
      assert.deepEqual(rowNames(await get(listPath), 'project'), [projectName]);
      assert.deepEqual(rowNames(await get(taskPath), 'task'), [title]);
      assert.deepEqual(rowNames(await get('/'), 'project'), [projectName, 'Alpha\u00a0Team']);
      assert.deepEqual(rowNames(await get('/projects/1'), 'task'), [title, 'First\u00a0Task']);
    };
    await check();
    await server.stop();
    server = await start(databasePath);
    await check();
    await post('/projects/1/archive');
    assert.deepEqual(rowNames(await get(listPath + '&filter=Archived'), 'project'), [projectName]);
    assert.deepEqual(rowNames(await get(taskPath), 'task'), [title]);
    await post('/projects/1/restore');
    await check();
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
