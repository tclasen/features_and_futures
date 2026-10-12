import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const titles = html => [...html.matchAll(/data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map(match => match[1]);
// Read the actual rendered form fields, including duplicate names, like a browser.
function fields(html, action) {
  const form = [...html.matchAll(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)].find(match => match[1] === action);
  assert.ok(form, action);
  const params = new URLSearchParams();
  for (const input of form[2].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)) params.append(input[1], input[2]);
  for (const input of form[2].matchAll(/<input id="[^"]+" name="([^"]+)" type="text" value="([^"]*)"/g)) params.append(input[1], input[2]);
  return params;
}

test('inclusive due ranges intersect filters, preserve state through edits, and validate without replacing applied boundaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  const dbPath = join(directory, 'db.sqlite');
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited ${code}`)));
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
  const apply = async (html, from, through) => {
    const params = fields(html, '/projects/1/due-range');
    assert.equal(params.getAll('dueFrom').length, 1);
    params.set('dueFrom', from); params.set('dueThrough', through);
    return fetch(base + '/projects/1/due-range?' + params, { redirect: 'manual' });
  };
  try {
    await start();
    await post('/projects', { name: 'Dates' });
    for (const title of ['Undated', 'First', 'Middle', 'Last', 'Outside']) await post('/projects/1/tasks', { title });
    for (const [id, dueDate] of [[2, '2024-02-28'], [3, '2024-02-29'], [4, '2024-03-01'], [5, '2024-03-02']]) await post(`/projects/1/tasks/${id}/due-date`, { dueDate });
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    await post('/projects/1/tasks/3', { completed: '1' });
    const summary = await get('/');
    let html = await get('/projects/1');
    let response = await apply(html, ' 2024-02-28 ', ' 2024-03-01 ');
    assert.equal(response.status, 303);
    let location = response.headers.get('location');
    html = await get(location);
    assert.deepEqual(titles(html), ['First', 'Middle', 'Last']);
    for (const [from, through, message] of [
      ['2023-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['0000-01-01', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['', '2024-04-31', 'Due range must use valid YYYY-MM-DD dates'],
      ['2024-03-01', '2024-02-28', 'Due from must not be after Due through']
    ]) {
      response = await apply(html, from, through);
      assert.equal(response.status, 422);
      const invalid = await response.text();
      assert.ok(invalid.includes(`role="alert">${message}`));
      assert.deepEqual(titles(invalid), ['First', 'Middle', 'Last']);
      const params = fields(invalid, '/projects/1/due-range');
      assert.equal(params.get('appliedFrom'), '2024-02-28');
      assert.equal(params.get('appliedThrough'), '2024-03-01');
    }
    const filters = new URLSearchParams({ filter: 'Completed', priorityFilter: 'High', dueFrom: '2024-02-28', dueThrough: '2024-03-01' });
    location = '/projects/1?' + filters;
    html = await get(location);
    assert.deepEqual(titles(html), ['Middle']);
    for (const [action, extra] of [
      ['/projects/1/tasks/3/rename', { title: 'Renamed' }],
      ['/projects/1/rename', { name: 'Renamed project' }],
      ['/projects/1/default-priority', { priority: 'Low' }],
      ['/projects/1/tasks', { title: 'New undated' }]
    ]) {
      const params = fields(html, action);
      for (const [key, value] of Object.entries(extra)) params.set(key, value);
      response = await post(action, params);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), location);
      html = await get(location);
      assert.deepEqual(titles(html), ['Renamed']);
    }
    let params = fields(html, '/projects/1/tasks/3/due-date');
    params.set('dueDate', '2024-03-02');
    response = await post('/projects/1/tasks/3/due-date', params);
    assert.equal(response.headers.get('location'), location);
    assert.deepEqual(titles(await get(location)), []);
    await post('/projects/1/tasks/3/due-date', { ...Object.fromEntries(filters), dueDate: '2024-02-29' });
    await post('/projects/1/tasks/3/priority', { ...Object.fromEntries(filters), priority: 'Normal' });
    assert.deepEqual(titles(await get(location)), []);
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    await post('/projects/1/tasks/3', Object.fromEntries(filters));
    assert.deepEqual(titles(await get(location)), []);
    await post('/projects/1/tasks/3', { completed: '1' });
    assert.deepEqual(titles(await get(location)), ['Renamed']);
    assert.match(summary, /1\/5 completed/);
    assert.match(await get('/'), /1\/6 completed/);
    for (const [from, through, expected] of [
      ['', '2024-02-29', ['First', 'Renamed']],
      ['2024-03-01', '', ['Last', 'Outside']],
      ['0001-01-01', '9999-12-31', ['First', 'Renamed', 'Last', 'Outside']],
      ['', '', ['Undated', 'First', 'Renamed', 'Last', 'Outside', 'New undated']]
    ]) {
      response = await apply(await get('/projects/1'), from, through);
      assert.equal(response.status, 303);
      assert.deepEqual(titles(await get(response.headers.get('location'))), expected);
    }
    await post('/projects/1/archive');
    html = await get(location);
    assert.deepEqual(titles(html), ['Renamed']);
    assert.match(html, /id="task-due-date-3"[^>]*disabled/);
    assert.doesNotMatch(html, /id="due-from"[^>]*disabled/);
    assert.doesNotMatch(html, /id="due-through"[^>]*disabled/);
    response = await apply(html, '', '2024-02-28');
    assert.deepEqual(titles(await get(response.headers.get('location'))), []);
    await stop(); await start();
    assert.deepEqual(titles(await get(location)), ['Renamed']);
    await post('/projects/1/restore');
    assert.deepEqual(titles(await get(location)), ['Renamed']);
    html = await get('/projects/1');
    assert.match(html, /id="due-from"[^>]*value=""/);
    assert.match(html, /id="due-through"[^>]*value=""/);
    assert.equal(titles(html).length, 6);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
