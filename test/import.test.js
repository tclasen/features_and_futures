import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
    child.stdout.on('data', data => {
      const match = /listening on port (\d+)/.exec(data.toString());
      if (match) resolve(match[1]);
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exit = once(child, 'exit'); child.kill(); await exit; },
  };
}

test('import validates atomically and preserves independent portable data and reserved positions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-import-'));
  const dbPath = join(dir, 'db.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const get = path => fetch(server.url + path);
    const post = (path, data = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const download = async id => (await get(`/projects/${id}/export`)).json();
    await post('/projects', { name: 'Original' });
    await post('/projects/1/tasks', { title: 'Unchanged' });
    const original = await download(1);
    const home = await (await get('/')).text();
    assert.match(home, /<label for="project-json">Project JSON<\/label>/);
    assert.match(home, /<label for="imported-project-name">Imported project name<\/label>/);
    assert.match(home, />Import project<\/button>/);
    const task = { title: '  Title  <b>雪</b>  ', completed: true, priority: 'High',
      dueDate: '0001-01-01', notes: '  <script>literal</script>\r\n雪\rline\n  ', deleted: true };
    const document = { format: 'workboard-project', version: 1, project: {
      name: 'Original', archived: false, defaultPriority: 'Low', tasks: [task,
        { ...task, title: 'Live', completed: false, priority: 'Normal', dueDate: '2000-02-29', notes: '', deleted: false }],
    } };
    const db = new DatabaseSync(dbPath);
    const snapshot = () => JSON.stringify({
      projects: db.prepare('SELECT * FROM projects ORDER BY id').all(),
      tasks: db.prepare('SELECT * FROM tasks ORDER BY id').all(),
      positions: db.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all(),
    });
    const before = snapshot();
    const invalid = ['{', 'null', '[]'];
    const changed = action => { const copy = structuredClone(document); action(copy); invalid.push(JSON.stringify(copy)); };
    changed(d => { d.format = 'other'; });
    changed(d => { d.version = '1'; });
    changed(d => { d.version = 2; });
    changed(d => { d.project = []; });
    for (const field of ['name', 'archived', 'defaultPriority', 'tasks']) {
      changed(d => { delete d.project[field]; });
    }
    changed(d => { d.project.name = ' \t '; });
    changed(d => { d.project.archived = 0; });
    changed(d => { d.project.defaultPriority = 'normal'; });
    changed(d => { d.project.tasks = {}; });
    for (const field of ['title', 'completed', 'priority', 'dueDate', 'notes', 'deleted']) {
      changed(d => { delete d.project.tasks[1][field]; });
    }
    for (const [field, value] of [['title', ' \t\n'], ['title', 1], ['completed', 1],
      ['priority', 'Urgent'], ['dueDate', null], ['notes', {}], ['deleted', 'false']]) {
      changed(d => { d.project.tasks[1][field] = value; });
    }
    for (const date of ['1900-02-29', '2023-02-29', '0000-01-01', '10000-01-01', '2024-04-31', '2024-1-01', ' 2024-01-01 ', '2024-01-01\n']) {
      changed(d => { d.project.tasks[1].dueDate = date; });
    }
    for (const json of invalid) {
      const response = await post('/projects/import', { json, importedName: '  Retained  ' });
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /role="alert">Invalid project JSON/);
      assert.match(html, /value="  Retained  "/);
      assert.equal(snapshot(), before);
    }
    const blank = await post('/projects/import', { json: JSON.stringify(document), importedName: ' \t ' });
    assert.match(await blank.text(), /role="alert">Project name is required/);
    assert.equal(snapshot(), before);
    // Extra identity fields must never control IDs, ownership or ordering.
    document.project.id = 1;
    document.project.tasks[0].id = 1;
    document.project.tasks[0].project_id = 1;
    document.project.tasks[0].position = 99;
    const imported = await post('/projects/import', { json: JSON.stringify(document), importedName: '  Independent  ' });
    assert.equal(imported.status, 303);
    assert.equal(imported.headers.get('location'), '/projects/2');
    const expected = { format: document.format, version: 1, project: {
      name: 'Independent', archived: false, defaultPriority: 'Low',
      tasks: document.project.tasks.map(({ title, completed, priority, dueDate, notes, deleted }) =>
        ({ title, completed, priority, dueDate, notes: notes.replace(/\r\n?/g, '\n'), deleted })),
    } };
    assert.deepEqual(await download(2), expected);
    assert.deepEqual(await download(1), original);
    assert.match(await (await get('/')).text(), /1\/1 completed|0\/1 completed/);
    const deletedHtml = await (await get('/projects/2?filter=Deleted')).text();
    assert.match(deletedHtml, /<fieldset disabled>/);
    assert.match(deletedHtml, />Restore task<\/button>/);
    assert.ok(!deletedHtml.includes('<script>literal</script>'));
    await post('/projects/2/default-priority', { priority: 'Normal' });
    await post('/projects/2/tasks', { title: 'Later' });
    const restore = await post('/projects/2/tasks/2/restore', { filter: 'Deleted' });
    assert.match(restore.headers.get('location'), /filter=Deleted/);
    await post('/projects/2/tasks/2/move', { destination: '1' });
    await post('/projects/1/tasks/2/rename', { title: 'Updated' });
    await post('/projects/1/tasks/2/move', { destination: '2' });
    const current = await download(2);
    assert.deepEqual(current.project.tasks.map(t => t.title), ['Updated', 'Live', 'Later']);
    assert.equal(current.project.tasks[0].priority, 'High');
    assert.equal(current.project.tasks[0].notes, expected.project.tasks[0].notes);
    assert.deepEqual(await download(1), original);
    document.project.archived = true;
    const archived = await post('/projects/import', { json: JSON.stringify(document), importedName: 'Archived copy' });
    assert.equal(archived.headers.get('location'), '/projects/3');
    assert.match(await (await get('/projects/3?filter=Deleted')).text(), /<button type="submit" disabled>Restore task/);
    await post('/projects/3/restore');
    await post('/projects/3/tasks/5/restore', { filter: 'Deleted' });
    assert.equal((await download(3)).project.tasks[0].deleted, false);
    const empty = structuredClone(document);
    empty.project.tasks = [];
    await post('/projects/import', { json: JSON.stringify(empty), importedName: 'Empty' });
    assert.deepEqual((await download(4)).project.tasks, []);
    db.close();
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await download(2), current);
    assert.deepEqual(await download(1), original);
    assert.equal((await download(3)).project.tasks[0].deleted, false);
    assert.deepEqual((await download(4)).project.tasks, []);
  } finally {
    if (server) await server.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
