import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';

test('ASCII substring search intersects filters and remains applied across task edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'db.sqlite') }, stdio: 'ignore'
    });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exit = once(child, 'exit');
      child.kill('SIGTERM');
      await exit;
    }
  }
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
  });
  const get = async path => (await fetch(base + path)).text();
  const projectNames = html => [...html.matchAll(/data-testid="project-row"><span>([^<]*)<\/span>/g)].map(m => m[1]);
  const titles = html => [...html.matchAll(/<\/form><span>([^<]*)<\/span>/g)].map(m => m[1]);
  const project = '/projects/1';
  const state = { filter: 'Open', priorityFilter: 'High', dueFrom: '2024-01-01', dueThrough: '2024-12-31', search: 'aLPhA' };
  const location = `${project}?${new URLSearchParams(state)}`;
  try {
    await start();
    for (const name of ['Alpha  Team', 'alpha team', 'Other', 'ÄLPHA']) await post('/projects', { name });
    assert.deepEqual(projectNames(await get('/?search=%20ALPHA%20')), ['Alpha  Team', 'alpha team']);
    assert.deepEqual(projectNames(await get('/?search=alpha%20%20team')), ['Alpha  Team']);
    assert.deepEqual(projectNames(await get('/?search=älpha')), []);
    await post('/projects/2/archive');
    assert.deepEqual(projectNames(await get('/?search=ALPHA')), ['Alpha  Team']);
    assert.deepEqual(projectNames(await get('/?filter=Archived&search=ALPHA')), ['alpha team']);
    assert.match(await get('/?search=ALPHA'), /type="hidden" name="search" value="ALPHA"/);
    assert.match(await get('/'), /id="project-search" name="search" value=""/);
    for (const title of ['Alpha first', 'ALPHA  second', 'Other', 'alpha last']) await post(project + '/tasks', { title });
    for (let id = 1; id <= 4; id++) {
      await post(`${project}/tasks/${id}/priority`, { priority: 'High' });
      await post(`${project}/tasks/${id}/due-date`, { dueDate: '2024-06-01' });
    }
    await post(project + '/tasks/4/completion', { completed: '1' });
    assert.deepEqual(titles(await get(location)), ['Alpha first', 'ALPHA  second']);
    assert.deepEqual(titles(await get(project + '?search=alpha%20%20')), ['Alpha first', 'ALPHA  second', 'alpha last']);
    assert.deepEqual(titles(await get(project + '?search=alpha%20%20second')), ['ALPHA  second']);
    assert.match(await get(location), /name="search" value="aLPhA"/);
    for (const [route, values] of [
      ['/rename', { name: 'Renamed' }],
      ['/default-priority', { priority: 'High' }],
      ['/tasks', { title: 'Alpha undated' }],
      ['/tasks/1/rename', { title: 'Alpha changed' }]
    ]) {
      const response = await post(project + route, { ...state, ...values });
      assert.equal(response.headers.get('location'), location);
    }
    assert.deepEqual(titles(await get(location)), ['Alpha changed', 'ALPHA  second']);
    const invalid = await post(project + '/due-range', { ...state, rangeFrom: '2024-02-30' });
    assert.equal(invalid.status, 400);
    assert.deepEqual(titles(await invalid.text()), ['Alpha changed', 'ALPHA  second']);
    const range = await post(project + '/due-range', { ...state, rangeFrom: state.dueFrom, rangeThrough: state.dueThrough });
    assert.equal(range.headers.get('location'), location);
    for (const [route, values, expected] of [
      ['/tasks/1/rename', { title: 'No match' }, ['ALPHA  second']],
      ['/tasks/2/priority', { priority: 'Low' }, []],
      ['/tasks/2/priority', { priority: 'High' }, ['ALPHA  second']],
      ['/tasks/2/due-date', { dueDate: '' }, []],
      ['/tasks/2/due-date', { dueDate: '2024-06-01' }, ['ALPHA  second']],
      ['/tasks/2/completion', { completed: '1' }, []],
      ['/tasks/2/completion', {}, ['ALPHA  second']],
      ['/tasks/2/move', { destination: '3' }, []]
    ]) {
      const response = await post(project + route, { ...state, ...values });
      assert.equal(response.headers.get('location'), location);
      assert.deepEqual(titles(await get(response.headers.get('location'))), expected);
    }
    await post('/projects/3/tasks/2/move', { destination: '1' });
    assert.deepEqual(titles(await get(location)), ['ALPHA  second']);
    assert.deepEqual(titles(await get(project + '?search=alpha')), ['ALPHA  second', 'alpha last', 'Alpha undated']);
    assert.match(await get('/'), /project-summary">1\/5 completed/);
    await post(project + '/archive');
    const archived = await get(location);
    assert.match(archived, /Archived project/);
    assert.doesNotMatch(archived, /id="task-search"[^>]*disabled/);
    assert.deepEqual(titles(archived), ['ALPHA  second']);
    assert.deepEqual(titles(await get(project + '?filter=Completed&search=ALPHA')), ['alpha last']);
    await stop();
    await start();
    assert.deepEqual(titles(await get(location)), ['ALPHA  second']);
    await post(project + '/restore');
    assert.deepEqual(titles(await get(location)), ['ALPHA  second']);
    assert.match(await get(project), /id="task-search" name="search" value=""/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
