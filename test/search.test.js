import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rows = (html, kind) => [...html.matchAll(new RegExp(`data-testid="${kind}-row">\\s*<span>(.*?)<\\/span>`, 'g'))].map(match => match[1]);
function fields(html, action) {
  const form = [...html.matchAll(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)].find(match => match[1] === action);
  assert.ok(form, action);
  return new URLSearchParams([...form[2].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map(match => [match[1], match[2]]));
}

test('search intersects filters and survives edits, movement, archive, and restart without changing data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.on('error', reject);
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  }
  async function stop() { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; child = null; }
  const get = async path => (await fetch(base + path)).text();
  const post = (path, body = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(body), redirect: 'manual' });
  try {
    await start();
    for (const name of ['Alpha  Space', 'ALPHA Space', 'Other', 'Ä']) await post('/projects', { name });
    assert.deepEqual(rows(await get('/?search=+alpha+'), 'project'), ['Alpha  Space', 'ALPHA Space']);
    assert.deepEqual(rows(await get('/?search=alpha++space'), 'project'), ['Alpha  Space']);
    assert.deepEqual(rows(await get('/?search=%C3%A4'), 'project'), []);
    let html = await get('/?search=alpha');
    let response = await post('/projects/1/archive', fields(html, '/projects/1/archive'));
    assert.deepEqual(rows(await get(response.headers.get('location')), 'project'), ['ALPHA Space']);
    html = await get('/?filter=Archived&search=alpha');
    assert.deepEqual(rows(html, 'project'), ['Alpha  Space']);
    assert.equal(fields(html, '/').get('search'), 'alpha');
    await post('/projects/1/restore', fields(html, '/projects/1/restore'));
    for (const title of ['Find First', 'FIND Second', 'Find  Third', 'Other']) await post('/projects/1/tasks', { title });
    for (const id of [1, 2, 3]) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2024-02-29' });
    }
    await post('/projects/1/tasks/2', { completed: '1' });
    const location = '/projects/1?filter=Open&priorityFilter=High&dueFrom=2024-02-01&dueThrough=2024-03-01&search=find';
    html = await get(location);
    assert.deepEqual(rows(html, 'task'), ['Find First', 'Find  Third']);
    assert.deepEqual(rows(await get('/projects/1?search=find++third'), 'task'), ['Find  Third']);
    for (const [action, extra] of [
      ['/projects/1/rename', { name: 'Renamed' }],
      ['/projects/1/default-priority', { priority: 'Low' }],
      ['/projects/1/tasks', { title: 'Find Undated' }],
      ['/projects/1/tasks/1/rename', { title: 'Still FIND First' }]
    ]) {
      const params = fields(html, action);
      for (const [key, value] of Object.entries(extra)) params.set(key, value);
      response = await post(action, params);
      assert.equal(response.headers.get('location'), location);
      html = await get(location);
    }
    assert.deepEqual(rows(html, 'task'), ['Still FIND First', 'Find  Third']);
    const range = fields(html, '/projects/1/due-range');
    range.set('dueFrom', '2024-02-30');
    response = await fetch(base + '/projects/1/due-range?' + range);
    html = await response.text();
    assert.equal(response.status, 422);
    assert.deepEqual(rows(html, 'task'), ['Still FIND First', 'Find  Third']);
    assert.equal(fields(html, '/projects/1/tasks/1/move').get('search'), 'find');
    const move = fields(html, '/projects/1/tasks/1/move');
    move.set('destination', '2');
    response = await post('/projects/1/tasks/1/move', move);
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual(rows(await get(location), 'task'), ['Find  Third']);
    await post('/projects/2/tasks/1/move', { destination: '1' });
    assert.deepEqual(rows(await get(location), 'task'), ['Still FIND First', 'Find  Third']);
    html = await get(location);
    const rename = fields(html, '/projects/1/tasks/1/rename');
    rename.set('title', 'No match');
    response = await post('/projects/1/tasks/1/rename', rename);
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual(rows(await get(location), 'task'), ['Find  Third']);
    await post('/projects/1/archive');
    html = await get(location);
    assert.deepEqual(rows(html, 'task'), ['Find  Third']);
    assert.ok(html.includes('Search tasks'));
    assert.ok(html.includes('name="priority" disabled'));
    await stop(); await start();
    assert.deepEqual(rows(await get(location), 'task'), ['Find  Third']);
    await post('/projects/1/restore');
    html = await get('/projects/1');
    assert.deepEqual(rows(html, 'task'), ['No match', 'FIND Second', 'Find  Third', 'Other', 'Find Undated']);
    assert.ok(html.includes('id="task-search" name="search" type="text" value=""'));
    assert.ok((await get('/')).includes('1/5 completed'));
    assert.deepEqual(await (await fetch(base + '/health')).json(), { status: 'ok' });
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
