import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const rows = (html, kind) => [...html.matchAll(new RegExp(`data-testid="${kind}-row">\\s*<span>(.*?)<\\/span>`, 'g'))].map((match) => match[1]);

test('ASCII substring search intersects filters, survives edits, and resets on fresh navigation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  let child;
  let base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    base = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', () => reject(new Error(output)));
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  };
  const stop = async () => { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; child = null; };
  const get = async (path) => (await fetch(base + path)).text();
  const post = (path, fields = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(fields), redirect: 'manual' });
  try {
    await start();
    for (const name of ['Alpha  Team', 'alpha\t \tTeam', 'ALPHA archive', 'Älpha']) await post('/projects', { name });
    await post('/projects/3/archive');
    const projectNames = ['Alpha  Team', 'alpha\t \tTeam'];
    assert.deepEqual(rows(await get('/?query=%20ALPHA%20'), 'project'), projectNames);
    for (const query of ['alpha team', 'alpha  team', '\t ALPHA\t \tTEAM \t']) {
      assert.deepEqual(rows(await get(`/?${new URLSearchParams({ query })}`), 'project'), projectNames);
    }
    assert.deepEqual(rows(await get('/?query=alpha%0Ateam'), 'project'), []);
    assert.deepEqual(rows(await get('/?query=alpha&filter=Archived'), 'project'), ['ALPHA archive']);
    assert.deepEqual(rows(await get('/?query=%20%20'), 'project'), ['Alpha  Team', 'alpha\t \tTeam', 'Älpha']);
    assert.deepEqual(rows(await get('/?query=älpha'), 'project'), []);
    const list = await get('/?query=alpha');
    assert.match(list, /name="query" value="alpha"/);
    assert.match(list, /action="\/projects\/1" method="get"><button[^>]*>Open project/);

    for (const title of ['Ship  Now', 'SHIP\t \tNow', 'Other', 'Ship later']) await post('/projects/1/tasks', { title });
    for (const id of [1, 2]) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-02-29' });
    }
    await post('/projects/1/tasks/2', { completed: '1' });
    const state = { query: 'ship', filter: 'Open', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const view = `/projects/1?${new URLSearchParams(state)}`;
    assert.deepEqual(rows(await get(view), 'task'), ['Ship  Now']);
    for (const query of ['ship now', 'ship  now', '\t SHIP\t \tNOW \t']) {
      assert.deepEqual(rows(await get(`/projects/1?${new URLSearchParams({ query })}`), 'task'), ['Ship  Now', 'SHIP\t \tNow']);
    }
    assert.deepEqual(rows(await get('/projects/1?query=ship%0Anow'), 'task'), []);
    for (const form of (await get(view)).matchAll(/<form[^>]*action="\/projects\/1[^\"]*"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="query"/);
      assert.match(form[1], /name="dueFrom" value="2024-02-29"/);
    }
    const edit = async (path, fields, expected) => {
      const response = await post(path, { ...state, ...fields });
      assert.equal(response.status, 303);
      const url = new URL(response.headers.get('location'), base);
      for (const [key, value] of Object.entries(state)) assert.equal(url.searchParams.get(key), value);
      assert.deepEqual(rows(await get(url.pathname + url.search), 'task'), expected);
    };
    await edit('/projects/1/tasks/1/rename', { title: '  Ship\t  Now  ' }, ['Ship\t  Now']);
    assert.deepEqual(rows(await get('/projects/1?query=ship%20now'), 'task'), ['Ship\t  Now', 'SHIP\t \tNow']);
    await edit('/projects/1/tasks/1/rename', { title: '  SHIP revised  ' }, ['SHIP revised']);
    await edit('/projects/1/rename', { name: 'Renamed' }, ['SHIP revised']);
    await edit('/projects/1/default-priority', { priority: 'Low' }, ['SHIP revised']);
    await edit('/projects/1/tasks', { title: 'Ship new' }, ['SHIP revised']);
    const invalid = await post('/projects/1/due-range', { ...state, from: '2024-02-30' });
    assert.equal(invalid.status, 400);
    assert.deepEqual(rows(await invalid.text(), 'task'), ['SHIP revised']);
    await edit('/projects/1/tasks/1/due-date', { dueDate: '' }, []);
    await edit('/projects/1/tasks/1/due-date', { dueDate: '2024-02-29' }, ['SHIP revised']);
    await edit('/projects/1/tasks/1', { completed: '1' }, []);
    await edit('/projects/1/tasks/1', {}, ['SHIP revised']);
    await edit('/projects/1/tasks/1/priority', { priority: 'Normal' }, []);
    await edit('/projects/1/tasks/1/priority', { priority: 'High' }, ['SHIP revised']);
    await edit('/projects/1/tasks/1/move', { destination: '2' }, []);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await get(view), 'task'), ['SHIP revised']);
    assert.match(await get('/'), /1\/5 completed/);
    await post('/projects/1/archive');
    const archived = await get(view);
    assert.deepEqual(rows(archived, 'task'), ['SHIP revised']);
    assert.match(archived, /id="task-search"[^>]*value="ship"/);
    assert.doesNotMatch(archived, /id="task-search"[^>]*disabled/);
    assert.match(archived, /aria-label="Complete SHIP revised"[^>]*disabled/);
    await stop();
    await start();
    assert.deepEqual(rows(await get(view), 'task'), ['SHIP revised']);
    await post('/projects/1/restore');
    assert.deepEqual(rows(await get('/projects/1'), 'task'), ['SHIP revised', 'SHIP\t \tNow', 'Other', 'Ship later', 'Ship new']);
    assert.deepEqual(rows(await get('/projects/1?query=ship%20now'), 'task'), ['SHIP\t \tNow']);
    assert.deepEqual(rows(await get('/?query=alpha%20team'), 'project'), ['alpha\t \tTeam']);
    assert.match(await get('/projects/1'), /id="task-search"[^>]*value=""/);
    assert.match(await get('/'), /id="project-search"[^>]*value=""/);
    const escaped = await get('/projects/1?query=%22%3E%3Cscript%3E');
    assert.match(escaped, /value="&quot;&gt;&lt;script&gt;"/);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
