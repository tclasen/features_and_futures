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

test('task renaming preserves order, ownership, completion and summaries across archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await launch(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Finished' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other project' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    const original = await get('/projects/1');
    const otherProject = await get('/projects/2');
    const summary = await get('/');
    for (const row of taskRows(original)) {
      assert.match(row, /<label for="new-task-title-\d+">New task title<\/label>/);
      assert.match(row, /<button type="submit">Rename task<\/button>/);
      assert.doesNotMatch(row, / disabled/);
    }

    for (const title of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/tasks/1/rename', { title, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(taskRows(html).length, 1);
      assert.match(taskRows(html)[0], /class="task-title">Finished<\/span>/);
      assert.equal(await get('/projects/1'), original);
      assert.equal(await get('/'), summary);
    }
    for (const path of [
      '/projects/2/tasks/1/rename', '/projects/1/tasks/3/rename',
      '/projects/1/tasks/999/rename', '/projects/999/tasks/1/rename',
      '/projects/1/tasks/9007199254740993/rename',
    ]) {
      assert.equal((await post(path, { title: 'Blocked' })).status, 404);
    }

    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Renamed <task> & "work"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal((await post('/projects/1/tasks/2/rename', {
      title: '  Renamed pending  ', filter: 'Open',
    })).status, 303);
    const saved = await get('/projects/1');
    const rows = taskRows(saved);
    assert.equal(rows.length, 2);
    assert.match(rows[0], /class="task-title">Renamed &lt;task&gt; &amp; &quot;work&quot;<\/span>/);
    assert.match(rows[0], /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;work&quot;" checked/);
    assert.match(rows[0], /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.match(rows[1], /class="task-title">Renamed pending<\/span>/);
    assert.doesNotMatch(rows[1], / checked/);
    assert.match(rows[1], /action="\/projects\/1\/tasks\/2\/rename"/);
    const completedRows = taskRows(await get('/projects/1?filter=Completed'));
    const openRows = taskRows(await get('/projects/1?filter=Open'));
    assert.equal(completedRows.length, 1);
    assert.match(completedRows[0], /aria-label="Complete Renamed &lt;task&gt; &amp; &quot;work&quot;" checked/);
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /class="task-title">Renamed pending<\/span>/);
    assert.equal(await get('/projects/2'), otherProject);
    assert.equal(await get('/'), summary);

    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), summary);

    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    for (const row of taskRows(archived)) {
      assert.match(row, /<input id="new-task-title-\d+"[^>]* disabled>/);
      assert.match(row, /<button type="submit" disabled>Rename task<\/button>/);
    }
    assert.equal(taskRows(await get('/projects/1?filter=Completed')).length, 1);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 409);
    assert.equal(await get('/projects/1'), archived);
    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), summary);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: ' After restore ' })).status, 303);
    const restored = await get('/projects/1');
    assert.match(taskRows(restored)[0], /aria-label="Complete After restore" checked/);
    assert.doesNotMatch(restored, / disabled/);
    assert.equal(await get('/'), summary);
    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get('/projects/1'), restored);
    await post('/projects/1/tasks/1/completion');
    assert.equal(taskRows(await get('/projects/1?filter=Open')).length, 2);
    assert.equal(taskRows(await get('/projects/1?filter=Completed')).length, 0);
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
