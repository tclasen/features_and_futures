import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(path) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: path }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    child.once('exit', code => reject(new Error(`Server exited ${code}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.stderr.on('data', () => {});
  });
  return { url, stop: () => new Promise(resolve => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
  }) };
}

test('import validates atomically, preserves exact portable fields and reserves independent positions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-import-'));
  const path = join(directory, 'db.sqlite');
  let server;
  try {
    server = await start(path);
    const get = route => fetch(server.url + route);
    const post = (route, data = {}) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const snapshot = () => {
      const db = new DatabaseSync(path);
      try {
        return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
      } finally { db.close(); }
    };
    const home = await (await get('/')).text();
    assert.match(home, /<label for="project-json">Project JSON<\/label>/);
    assert.match(home, /<textarea id="project-json"/);
    assert.match(home, />Import project<\/button>/);
    await post('/projects', { name: 'Original' });
    await post('/projects/1/tasks', { title: 'Original task' });
    const task = { title: '  Exact  TITLE\t雪  ', completed: true, priority: 'High', dueDate: '2000-02-29', notes: '  <b>&雪</b>\r\n\rnext\n  ', deleted: true };
    const document = { format: 'workboard-project', version: 1, project: {
      name: 'Portable name', archived: false, defaultPriority: 'Low', tasks: [task,
        { ...task, title: 'Live', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false }],
    } };
    const before = snapshot();
    const invalid = ['{bad', 'null', '[]'];
    const mutate = action => { const copy = structuredClone(document); action(copy); invalid.push(JSON.stringify(copy)); };
    mutate(d => { d.format = 'other'; });
    mutate(d => { d.version = '1'; });
    mutate(d => { d.version = 2; });
    mutate(d => { delete d.project; });
    for (const [field, value] of [['name', '  '], ['archived', 1], ['defaultPriority', 'normal'], ['tasks', {}]]) {
      mutate(d => { d.project[field] = value; });
    }
    for (const field of Object.keys(task)) mutate(d => { delete d.project.tasks[1][field]; });
    for (const [field, value] of [['title', '\t '], ['title', 4], ['completed', 1], ['priority', 'Other'], ['dueDate', '1900-02-29'], ['dueDate', '0000-01-01'], ['dueDate', '2025-04-31'], ['dueDate', ' 2000-02-29 '], ['dueDate', null], ['notes', null], ['deleted', 'false']]) {
      mutate(d => { d.project.tasks[1][field] = value; });
    }
    for (const text of invalid) {
      const response = await post('/projects/import', { projectJson: text, importedName: '  Copy 雪  ' });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Invalid project JSON/);
      assert.match(html, /value="  Copy 雪  "/);
      const escaped = text.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[character]);
      assert.ok(html.includes(`rows="8">\n${escaped}</textarea>`));
      assert.deepEqual(snapshot(), before);
    }
    const blank = await post('/projects/import', { projectJson: JSON.stringify(document), importedName: ' \t ' });
    assert.match(await blank.text(), /role="alert">Project name is required/);
    assert.deepEqual(snapshot(), before);
    document.project.id = 1;
    document.project.tasks[0].id = 1;
    const imported = await post('/projects/import', { projectJson: JSON.stringify(document), importedName: '  Copy 雪  ' });
    assert.equal(imported.status, 303);
    assert.equal(imported.headers.get('location'), '/projects/2');
    const exported = async id => (await (await get(`/projects/${id}/export`)).json()).project;
    const expected = { ...document.project, name: 'Copy 雪', tasks: document.project.tasks.map(({ id, ...t }) => ({ ...t, notes: t.notes.replace(/\r\n?/g, '\n') })) };
    delete expected.id;
    assert.deepEqual(await exported(2), expected);
    assert.deepEqual(snapshot().map(rows => rows.slice(0, 1)), before.map(rows => rows.slice(0, 1)));
    const list = await (await get('/')).text();
    assert.match(list, /0\/1 completed/);
    const deleted = await (await get('/projects/2?filter=Deleted')).text();
    assert.match(deleted, /<textarea[^>]*disabled/);
    assert.match(deleted, />Restore task<\/button>/);
    await post('/projects/2/tasks', { title: 'Later' });
    await post('/projects/2/tasks/2/restore', { filter: 'Deleted' });
    assert.deepEqual((await exported(2)).tasks.map(t => t.title), [task.title, 'Live', 'Later']);
    await post('/projects/2/tasks/2/move', { destination: '1' });
    await post('/projects/1/tasks/2/move', { destination: '2' });
    assert.deepEqual((await exported(2)).tasks.map(t => t.title), [task.title, 'Live', 'Later']);
    assert.equal((await exported(2)).tasks[0].notes, expected.tasks[0].notes);
    document.project.archived = true;
    const archived = await post('/projects/import', { projectJson: JSON.stringify(document), importedName: 'Archived copy' });
    assert.equal(archived.headers.get('location'), '/projects/3');
    const archivedPage = await (await get('/projects/3?filter=Deleted')).text();
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /disabled>Restore task/);
    const empty = structuredClone(document);
    empty.project.tasks = [];
    assert.equal((await post('/projects/import', { projectJson: JSON.stringify(empty), importedName: 'Empty' })).status, 303);
    assert.deepEqual((await exported(4)).tasks, []);
    const saved = snapshot();
    await server.stop();
    server = await start(path);
    assert.deepEqual(snapshot(), saved);
    assert.equal((await exported(3)).tasks[0].deleted, true);
    assert.equal((await exported(1)).tasks[0].title, 'Original task');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
