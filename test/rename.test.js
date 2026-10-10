import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from './server-helper.js';

test('renaming preserves project identity and tasks, validates names, and survives archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await launch(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = (html, kind) => [...html.matchAll(new RegExp(`<article class="${kind}-row" data-testid="${kind}-row">([\\s\\S]*?)</article>`, 'g'))]
      .map((match) => match[1]);

    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Finished' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: 'on' });
    const original = await get('/projects/1');
    assert.match(original, /<label for="new-project-name">New project name<\/label>/);
    assert.match(original, /<input id="new-project-name"[^>]*value="Original">/);
    assert.match(original, /<button type="submit">Rename project<\/button>/);

    for (const name of ['', ' \t\n ']) {
      const invalid = await post('/projects/1/rename', { name, filter: 'Completed' });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.equal(rows(html, 'task').length, 1);
      assert.equal(await get('/projects/1'), original);
      assert.match(rows(await get('/'), 'project')[0], /class="project-name">Original<\/span>/);
    }

    const renamed = await post('/projects/1/rename', { name: '  Renamed <team> & "work"  ', filter: 'Open' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Open');
    const saved = await get('/projects/1');
    assert.match(saved, /<h1>Renamed &lt;team&gt; &amp; &quot;work&quot;<\/h1>/);
    assert.deepEqual(rows(saved, 'task'), rows(original, 'task'));
    const list = await get('/');
    const projects = rows(list, 'project');
    assert.equal(projects.length, 2);
    assert.match(projects[0], /class="project-name">Renamed &lt;team&gt; &amp; &quot;work&quot;<\/span>/);
    assert.match(projects[0], /action="\/projects\/1"/);
    assert.match(projects[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(projects[1], /class="project-name">Second<\/span>/);
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    assert.equal((await post('/projects/9007199254740993/rename', { name: 'Missing' })).status, 404);

    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get('/projects/1'), saved);
    assert.equal(await get('/'), list);

    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assert.match(archived, /<input id="new-project-name"[^>]* disabled>/);
    assert.match(archived, /<button type="submit" disabled>Rename project<\/button>/);
    const rejected = await post('/projects/1/rename', { name: 'Blocked rename' });
    assert.equal(rejected.status, 409);
    assert.equal(await get('/projects/1'), archived);
    assert.match(rows(await get('/?filter=Archived'), 'project')[0], /data-testid="project-summary">1\/2 completed/);

    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), saved);
    assert.equal((await post('/projects/1/rename', { name: ' After restoration ' })).status, 303);
    const restored = await get('/projects/1');
    assert.match(restored, /<h1>After restoration<\/h1>/);
    assert.doesNotMatch(restored, / disabled/);
    assert.deepEqual(rows(restored, 'task'), rows(original, 'task'));
    assert.match(rows(await get('/'), 'project')[0], /data-testid="project-summary">1\/2 completed/);
    await running.stop();
    running = await launch(databasePath);
    assert.equal(await get('/projects/1'), restored);
  } finally {
    await running?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
