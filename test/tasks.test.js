import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from './server-helper.js';

function taskRows(html) {
  return [...html.matchAll(/<article class="task-row" data-testid="task-row">([\s\S]*?)<\/article>/g)]
    .map((match) => match[1]);
}

test('tasks validate, stay within their project, filter, and persist completion across process restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let running;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    running = await launch(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });

    const empty = await get('/projects/1');
    assert.match(empty, /<label for="task-title">Task title<\/label>/);
    assert.match(empty, />Create task<\/button>/);
    assert.match(empty, /<label for="task-filter">Task filter<\/label>/);
    assert.match(empty, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(taskRows(empty).length, 0);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks', { title });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(taskRows(html).length, 0);
    }

    const created = await post('/projects/1/tasks', { title: '  First task  ' });
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/projects/1?filter=All');
    await post('/projects/1/tasks', { title: 'Second <task> & "team"' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    const rows = taskRows(await get('/projects/1'));
    assert.equal(rows.length, 2);
    assert.match(rows[0], /class="task-title">First task<\/span>/);
    assert.match(rows[0], /type="checkbox" name="completed" aria-label="Complete First task"/);
    assert.doesNotMatch(rows[0], / checked/);
    assert.match(rows[1], /Complete Second &lt;task&gt; &amp; &quot;team&quot;/);
    assert.doesNotMatch(await get('/projects/1'), /Other project task/);
    assert.doesNotMatch(await get('/projects/2'), /First task/);

    const invalid = await post('/projects/1/tasks', { title: '  ' });
    assert.equal(taskRows(await invalid.text()).length, 2);
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: 'on' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing project' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/completion', { completed: 'on' })).status, 404);
    assert.equal((await post('/projects/1/tasks/9007199254740993/completion', { completed: 'on' })).status, 404);
    assert.equal(taskRows(await get('/projects/1?filter=Completed')).length, 0);

    const completed = await post('/projects/1/tasks/1/completion', { completed: 'on', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const saved = await get('/projects/1');
    assert.match(taskRows(saved)[0], / checked/);
    const openRows = taskRows(await get('/projects/1?filter=Open'));
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /Second &lt;task&gt;/);
    const completedPage = await get('/projects/1?filter=Completed');
    assert.match(completedPage, /<option selected>Completed<\/option>/);
    assert.equal(taskRows(completedPage).length, 1);
    assert.match(taskRows(completedPage)[0], /First task/);
    assert.equal(taskRows(await get('/projects/1?filter=invalid')).length, 2);

    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/projects/1?filter=Completed'), completedPage);
    await post('/projects/1/tasks/1/completion', {});
    assert.equal(taskRows(await get('/projects/1?filter=Open')).length, 2);
    assert.equal(taskRows(await get('/projects/1?filter=Completed')).length, 0);
    await running.stop();
    running = await launch(databasePath);
    assert.doesNotMatch(taskRows(await get('/projects/1'))[0], / checked/);
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
