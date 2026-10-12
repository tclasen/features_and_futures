import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApplication } from '../server.js';

test('search composes with filters and survives edits without changing stored data', async () => {
  const server = createApplication(':memory:');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async path => (await fetch(base + path)).text();
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const titles = text => [...text.matchAll(/aria-label="Complete ([^"]+)"/g)].map(m => m[1]);
  const names = text => [...text.matchAll(/data-testid="project-row">\s*<span>(.*?)<\/span>/g)].map(m => m[1]);
  try {
    for (const name of ['Alpha  team', 'ALPHA team', 'Ärea', 'ärea']) await post('/projects', { name });
    assert.deepEqual(names(await get('/?search=%20alpha%20')), ['Alpha  team', 'ALPHA team']);
    assert.deepEqual(names(await get('/?search=alpha%20%20team')), ['Alpha  team', 'ALPHA team']);
    assert.deepEqual(names(await get('/?search=Ä')), ['Ärea']);
    assert.deepEqual(names(await get('/?search=%20%20')), ['Alpha  team', 'ALPHA team', 'Ärea', 'ärea']);
    await post('/projects/2/archive', { search: 'alpha' });
    assert.deepEqual(names(await get('/?filter=Archived&search=ALPHA')), ['ALPHA team']);
    assert.deepEqual(names(await get('/?search=alpha')), ['Alpha  team']);
    for (const title of ['Alpha  task', 'ALPHA task', 'Other']) await post('/projects/1/tasks', { title });
    await post('/projects/1/tasks/1/priority', { priority: 'High' });
    await post('/projects/1/tasks/1/due-date', { dueDate: '2026-01-01' });
    const state = { filter: 'Open', priorityFilter: 'High', rangeFrom: '2026-01-01', rangeThrough: '2026-12-31', search: ' alpha ' };
    const view = () => get(`/projects/1?${new URLSearchParams(state)}`);
    assert.deepEqual(titles(await view()), ['Alpha  task']);
    assert.deepEqual(titles(await get('/projects/1?search=alpha%20%20task')), ['Alpha  task', 'ALPHA task']);
    const response = await post('/projects/1/tasks/1/rename', { ...state, title: 'New title' });
    const location = response.headers.get('location');
    const query = new URL(location, base).searchParams;
    for (const [key, value] of Object.entries(state)) assert.equal(query.get(key), value.trim());
    assert.deepEqual(titles(await get(location)), []);
    const invalid = await post('/projects/1/due-range', { ...state, dueFrom: 'invalid' });
    const invalidHtml = await invalid.text();
    assert.match(invalidHtml, /Due range must use valid/);
    assert.match(invalidHtml, /id="task-search" name="search" value="alpha"/);
    assert.deepEqual(titles(invalidHtml), []);
    await post('/projects/1/tasks/1/rename', { ...state, title: 'Alpha renamed' });
    assert.deepEqual(titles(await view()), ['Alpha renamed']);
    await post('/projects/1/default-priority', { ...state, priority: 'Low' });
    assert.deepEqual(titles(await view()), ['Alpha renamed']);
    const editedView = async (path, values) => {
      const result = await post(path, { ...state, ...values });
      assert.equal(result.status, 303);
      assert.equal(new URL(result.headers.get('location'), base).searchParams.get('search'), 'alpha');
      return titles(await get(result.headers.get('location')));
    };
    assert.deepEqual(await editedView('/projects/1/tasks/1/completion', { completed: '1' }), []);
    assert.deepEqual(await editedView('/projects/1/tasks/1/completion', { completed: '0' }), ['Alpha renamed']);
    assert.deepEqual(await editedView('/projects/1/tasks/1/due-date', { dueDate: '' }), []);
    assert.deepEqual(await editedView('/projects/1/tasks/1/due-date', { dueDate: '2026-01-01' }), ['Alpha renamed']);
    assert.deepEqual(await editedView('/projects/1/tasks/1/priority', { priority: 'Low' }), []);
    assert.deepEqual(await editedView('/projects/1/tasks/1/priority', { priority: 'High' }), ['Alpha renamed']);
    assert.deepEqual(await editedView('/projects/1/rename', { name: 'Renamed project' }), ['Alpha renamed']);
    assert.deepEqual(await editedView('/projects/1/tasks', { title: 'Nonmatching' }), ['Alpha renamed']);
    assert.match(await get('/projects/1?search=%22%3C%26'), /name="search" value="&quot;&lt;&amp;"/);
    const moved = await post('/projects/1/tasks/1/move', { ...state, destinationId: '3' });
    assert.deepEqual(titles(await get(moved.headers.get('location'))), []);
    await post('/projects/3/tasks/1/move', { destinationId: '1' });
    assert.deepEqual(titles(await get('/projects/1?search=alpha')), ['Alpha renamed', 'ALPHA task']);
    await post('/projects/1/archive');
    const archived = await view();
    assert.deepEqual(titles(archived), ['Alpha renamed']);
    assert.doesNotMatch(archived, /id="task-search"[^>]*disabled/);
    assert.match(archived, /name="title" value="Alpha renamed" disabled/);
    assert.deepEqual(titles(await get('/projects/1')), ['Alpha renamed', 'ALPHA task', 'Other', 'Nonmatching']);
    assert.match(await get('/'), /id="project-search" name="search" value=""/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
