import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../server.js';

test('space/tab normalization matches without rewriting persisted names or titles', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  let server;
  let base;
  const start = async () => {
    server = createApplication(join(directory, 'database.sqlite'));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const names = html => [...html.matchAll(/data-testid="project-row">\s*<span>(.*?)<\/span>/gs)].map(m => m[1]);
  const titles = html => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(m => m[1]);
  const query = search => new URLSearchParams({ search }).toString();
  const originals = ['MiXeD \t  team', 'mixed team', 'mixed\nteam', 'mixed\u00a0team'];
  try {
    await start();
    for (const name of originals) await post('/projects', { name });
    for (const title of originals) await post('/projects/1/tasks', { title });
    for (const search of [' mixed team ', '\tMIXED\t \tTEAM\t', 'mixed  team']) {
      assert.deepEqual(names(await get(`/?${query(search)}`)), originals.slice(0, 2));
      assert.deepEqual(titles(await get(`/projects/1?${query(search)}`)), originals.slice(0, 2));
    }
    // Other internal whitespace is not collapsed; trimming still applies to queries.
    for (const search of originals.slice(2)) {
      assert.deepEqual(names(await get(`/?${query(search)}`)), [search]);
      assert.deepEqual(titles(await get(`/projects/1?${query(search)}`)), [search]);
    }
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2026-02-01' });
    const state = { search: 'mixed\t team', filter: 'Completed', priorityFilter: 'High', rangeFrom: '2026-02-01', rangeThrough: '2026-02-01' };
    const path = `/projects/1?${new URLSearchParams(state)}`;
    assert.deepEqual(titles(await get(path)), [originals[0]]);
    await post('/projects/1/archive');
    assert.deepEqual(names(await get(`/?filter=Archived&${query('mixed team')}`)), [originals[0]]);
    assert.deepEqual(titles(await get(path)), [originals[0]]);
    await stop();
    await start();
    assert.deepEqual(titles(await get(path)), [originals[0]]);
    await post('/projects/1/restore');
    assert.deepEqual(names(await get('/')), originals);
    assert.deepEqual(titles(await get('/projects/1')), originals);
    assert.deepEqual(names(await get(`/?${query('\t  ')}`)), originals);
    assert.deepEqual(titles(await get(`/projects/1?${query('\t  ')}`)), originals);
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
