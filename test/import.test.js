import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('imports validate atomically, preserve portable fields and create independent ordered projects', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-import-'));
  const dbPath = join(dir, 'db.sqlite');
  let child, base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'inherit']
    });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.stdout.on('data', chunk => {
        const match = /listening on port (\d+)/.exec(String(chunk));
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  };
  const stop = async () => { const exit = once(child, 'exit'); child.kill(); await exit; };
  const post = (path, data = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(data), redirect: 'manual' });
  const html = async path => (await fetch(base + path)).text();
  const download = async id => (await fetch(`${base}/projects/${id}/export`)).json();
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    try { return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); }
    finally { db.close(); }
  };
  const task = { title: '  Original  TITLE 雪  ', completed: true, priority: 'High', dueDate: '2000-02-29', notes: '  <b>&雪</textarea>\r\nnext\rfinal\n ', deleted: false };
  const document = { format: 'workboard-project', version: 1, project: {
    name: 'Portable source', archived: false, defaultPriority: 'Low', tasks: [task, { ...task, title: 'Deleted', completed: false, dueDate: '', notes: '', deleted: true }]
  } };
  const clone = () => structuredClone(document);
  const importProject = (doc, name = '  Imported  ') => post('/projects/import', { json: typeof doc === 'string' ? doc : JSON.stringify(doc), importName: name });
  try {
    await start();
    const home = await html('/');
    assert.match(home, /<label for="project-json">Project JSON<\/label>/);
    assert.match(home, /<textarea id="project-json"/);
    assert.match(home, />Imported project name<\/label>/);
    assert.match(home, />Import project<\/button>/);
    await post('/projects', { name: 'Original' });
    await post('/projects/1/tasks', { title: 'Original task' });
    const before = snapshot();
    const invalid = ['{', 'null', '[]', '{}'];
    for (const mutate of [
      d => { d.format = 'other'; }, d => { d.version = '1'; }, d => { d.version = 2; },
      d => { d.project = []; }, d => { d.project.name = ' \t'; }, d => { d.project.archived = 0; },
      d => { d.project.defaultPriority = 'normal'; }, d => { d.project.tasks = {}; },
      d => { d.project.tasks[1].title = ' \n'; }, d => { d.project.tasks[1].completed = 1; },
      d => { d.project.tasks[1].priority = 'Urgent'; }, d => { d.project.tasks[1].notes = null; },
      d => { d.project.tasks[1].deleted = 'false'; }, d => { delete d.project.tasks[1].notes; }
    ]) { const d = clone(); mutate(d); invalid.push(JSON.stringify(d)); }
    for (const date of ['1900-02-29', '2023-02-29', '0000-01-01', '10000-01-01', '2024-04-31', '2024-1-01', ' 2024-01-01 ', null]) {
      const d = clone(); d.project.tasks[1].dueDate = date; invalid.push(JSON.stringify(d));
    }
    for (const json of invalid) {
      const response = await importProject(json, ' Keep name ');
      assert.equal(response.status, 200);
      const result = await response.text();
      assert.match(result, /role="alert">Invalid project JSON/);
      assert.ok(result.includes('value=" Keep name "'));
      assert.ok(result.includes(json.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])));
      assert.deepEqual(snapshot(), before);
    }
    assert.match(await (await importProject(document, ' \t ')).text(), /role="alert">Project name is required/);
    assert.deepEqual(snapshot(), before);
    const extra = clone();
    extra.project.id = 1; extra.project.tasks[0].id = 1; extra.project.tasks[0].project_id = 1;
    const response = await importProject(extra);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/2');
    const expected = clone(); expected.project.name = 'Imported';
    expected.project.tasks[0].notes = task.notes.replace(/\r\n?/g, '\n');
    assert.deepEqual(await download(2), expected);
    assert.deepEqual(snapshot().map(rows => rows.slice(0, 1)), before.map(rows => rows.slice(0, 1)));
    assert.match(await html('/'), /1\/1 completed/);
    assert.match(await html('/projects/2?filter=Deleted'), />Restore task<\/button>/);
    const rows = snapshot()[1];
    const liveId = rows.find(row => row.project_id === 2 && !row.deleted).id;
    const deletedId = rows.find(row => row.project_id === 2 && row.deleted).id;
    await post('/projects/2/tasks', { title: 'Later' });
    await post(`/projects/2/tasks/${deletedId}/restore`, { filter: 'Deleted' });
    assert.deepEqual((await download(2)).project.tasks.map(t => t.title), [task.title, 'Deleted', 'Later']);
    await post(`/projects/2/tasks/${liveId}/move`, { destination: '1' });
    await post(`/projects/1/tasks/${liveId}/rename`, { title: 'Changed' });
    await post(`/projects/1/tasks/${liveId}/move`, { destination: '2' });
    assert.deepEqual((await download(2)).project.tasks.map(t => t.title), ['Changed', 'Deleted', 'Later']);
    assert.equal((await download(2)).project.tasks[0].notes, expected.project.tasks[0].notes);
    assert.equal((await download(1)).project.tasks[0].title, 'Original task');
    const archived = clone(); archived.project.archived = true;
    assert.equal((await importProject(archived, 'Archived copy')).headers.get('location'), '/projects/3');
    assert.match(await html('/projects/3'), /Archived project/);
    assert.match(await html('/projects/3?filter=Deleted'), /<button type="submit" disabled>Restore task/);
    assert.equal((await download(3)).project.archived, true);
    const empty = clone(); empty.project.tasks = [];
    assert.equal((await importProject(empty, 'Empty')).headers.get('location'), '/projects/4');
    assert.deepEqual((await download(4)).project.tasks, []);
    const saved = snapshot();
    await stop(); await start();
    assert.deepEqual(snapshot(), saved);
    assert.deepEqual((await download(2)).project.tasks.map(t => t.title), ['Changed', 'Deleted', 'Later']);
    await post('/projects/3/restore');
    assert.match(await html('/projects/3?filter=Deleted'), /<button type="submit">Restore task/);
  } finally {
    if (child && child.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
