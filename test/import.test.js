import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('validated atomic imports preserve portable state, independence, order and persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-import-'));
  const database = join(directory, 'data.sqlite');
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: database }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
  }
  async function stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const edit = async (path, values) => assert.equal((await post(path, values)).status, 303);
  const exported = async id => (await fetch(`${base}/projects/${id}/export`)).json();
  const snapshot = () => {
    const db = new DatabaseSync(database);
    try {
      return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    } finally { db.close(); }
  };
  const task = { title: '  First  雪 <b>  ', completed: true, priority: 'High', dueDate: '2000-02-29', notes: '  <script>😀&</script>\r\nnext\rlast\n  ', deleted: true };
  const document = { format: 'workboard-project', version: 1, project: {
    name: 'Original', archived: true, defaultPriority: 'Low', tasks: [
      task, { ...task, title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
    ],
  } };
  try {
    await start();
    const home = await (await fetch(base)).text();
    assert.match(home, /<label for="project-json">Project JSON<\/label>/);
    assert.match(home, /<textarea id="project-json"/);
    assert.match(home, /Imported project name/);
    assert.match(home, />Import project<\/button>/);
    await edit('/projects', { name: 'Untouched' });
    await edit('/projects/1/tasks', { title: 'Original task' });
    const before = snapshot();
    const invalid = ['not json', '\n<invalid>&markup', 'null', '[]', '{}'];
    const change = mutate => { const copy = structuredClone(document); mutate(copy); invalid.push(JSON.stringify(copy)); };
    change(d => { d.format = 'other'; });
    change(d => { d.version = '1'; });
    change(d => { d.version = 2; });
    change(d => { d.project = []; });
    change(d => { d.project.name = ' \t '; });
    change(d => { d.project.archived = 1; });
    change(d => { d.project.defaultPriority = 'normal'; });
    change(d => { d.project.tasks = {}; });
    for (const field of Object.keys(task)) change(d => { delete d.project.tasks[1][field]; });
    for (const [field, value] of [['title', ' \n '], ['title', 2], ['completed', 0], ['priority', 'Urgent'], ['notes', null], ['deleted', 'false'], ['dueDate', 0]]) {
      change(d => { d.project.tasks[1][field] = value; });
    }
    for (const dueDate of ['1900-02-29', '2023-02-29', '0000-01-01', '10000-01-01', '2024-04-31', '2024-2-01', ' 2024-02-01 ', '2024-02-01\n', ' ']) {
      change(d => { d.project.tasks[1].dueDate = dueDate; });
    }
    for (const json of invalid) {
      const response = await post('/projects/import', { json, name: '  Copy  ' });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Invalid project JSON/);
      assert.match(html, /value="  Copy  "/);
      const encoded = json.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
      assert.ok(html.includes(`rows="6">\n${encoded}</textarea>`));
      assert.deepEqual(snapshot(), before);
    }
    const blank = await post('/projects/import', { json: JSON.stringify(document), name: ' \t ' });
    assert.equal(blank.status, 400);
    assert.match(await blank.text(), /role="alert">Project name is required/);
    assert.deepEqual(snapshot(), before);

    // Foreign IDs and remembered positions in additional properties are ignored.
    document.project.id = 1;
    document.project.tasks[0].id = 1;
    document.project.tasks[0].sort_order = 500;
    const response = await post('/projects/import', { json: JSON.stringify(document), name: '  Imported 雪  ' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/2');
    const expected = { format: document.format, version: 1, project: {
      name: 'Imported 雪', archived: true, defaultPriority: 'Low', tasks: document.project.tasks.map(t => ({
        title: t.title, completed: t.completed, priority: t.priority, dueDate: t.dueDate,
        notes: t.notes.replace(/\r\n?/g, '\n'), deleted: t.deleted,
      })),
    } };
    assert.deepEqual(await exported(2), expected);
    assert.deepEqual(snapshot().map(rows => rows.slice(0, 1)), before.map(rows => rows.slice(0, 1)));
    assert.equal((await post('/projects/2/tasks/2/restore')).status, 403);
    const archivedPage = await (await fetch(base + '/projects/2?filter=Deleted')).text();
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /Restore task<\/button>/);
    await stop();
    await start();
    assert.deepEqual(await exported(2), expected);
    await edit('/projects/2/restore');
    assert.match(await (await fetch(base)).text(), /0\/1 completed/);
    await edit('/projects/2/tasks', { title: 'Third' });
    await edit('/projects/2/default-priority', { priority: 'Normal' });
    const restored = await post('/projects/2/tasks/2/restore', { filter: 'Deleted', priorityFilter: 'High', search: 'First', dueFrom: '2000-01-01' });
    assert.equal(restored.status, 303);
    assert.match(restored.headers.get('location'), /filter=Deleted/);
    assert.match(restored.headers.get('location'), /priorityFilter=High/);
    assert.match(restored.headers.get('location'), /search=First/);
    assert.deepEqual((await exported(2)).project.tasks.map(t => t.title), [task.title, 'Second', 'Third']);
    await edit('/projects/2/tasks/2/move', { destination: '1' });
    await edit('/projects/1/tasks/2/rename', { title: 'Changed' });
    await edit('/projects/1/tasks/2/move', { destination: '2' });
    const returned = (await exported(2)).project.tasks[0];
    assert.deepEqual(returned, { ...expected.project.tasks[0], title: 'Changed', deleted: false });
    assert.equal((await exported(1)).project.tasks[0].title, 'Original task');
    await stop();
    await start();
    assert.equal((await exported(2)).project.tasks[0].title, 'Changed');

    const empty = structuredClone(document);
    empty.project.tasks = [];
    empty.project.archived = false;
    const emptyResponse = await post('/projects/import', { json: JSON.stringify(empty), name: 'Empty' });
    assert.equal(emptyResponse.status, 303);
    assert.deepEqual((await exported(3)).project.tasks, []);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
