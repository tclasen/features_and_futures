import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('imports validate atomically, preserve portable fields and order, and remain independent across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-import-'));
  const dbPath = join(directory, 'db.sqlite');
  let child, base;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      let output = '';
      child.on('error', reject);
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  }
  async function stop() { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; child = null; }
  const post = (path, body = {}) => fetch(base + path, { method: 'POST', body: new URLSearchParams(body), redirect: 'manual' });
  const get = async path => (await fetch(base + path)).text();
  const exported = async id => (await fetch(`${base}/projects/${id}/download`)).json();
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    try { return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); }
    finally { db.close(); }
  };
  const task = { title: '  First\t TASK  ', completed: true, priority: 'High', dueDate: '0001-01-01', notes: '  \r\n日本語 🌻 <script>literal</script>\rline\n  ', deleted: false };
  const document = { format: 'workboard-project', version: 1, project: { name: 'Portable name', archived: true, defaultPriority: 'Low', tasks: [task, { ...task, title: 'Deleted', deleted: true, dueDate: '2000-02-29' }, { ...task, title: 'Last', completed: false, priority: 'Normal', dueDate: '', notes: '' }] } };
  try {
    await start();
    const home = await get('/');
    assert.match(home, /<label for="project-json">Project JSON<\/label>/);
    assert.match(home, /<textarea id="project-json"/);
    assert.match(home, />Imported project name<\/label>/);
    await post('/projects', { name: 'Original' });
    await post('/projects/1/tasks', { title: 'Untouched' });
    const before = snapshot();
    const invalids = ['{broken', 'null', '[]'];
    const mutation = change => { const value = structuredClone(document); change(value); invalids.push(JSON.stringify(value)); };
    mutation(value => value.format = 'other');
    mutation(value => value.version = '1');
    mutation(value => value.version = 2);
    mutation(value => delete value.project);
    mutation(value => value.project.name = ' \t ');
    mutation(value => value.project.archived = 1);
    mutation(value => value.project.defaultPriority = 'Urgent');
    mutation(value => value.project.tasks = {});
    for (const field of Object.keys(task)) mutation(value => delete value.project.tasks[2][field]);
    mutation(value => value.project.tasks[2].title = '\n  ');
    mutation(value => value.project.tasks[2].completed = 'false');
    mutation(value => value.project.tasks[2].priority = 'normal');
    mutation(value => value.project.tasks[2].notes = null);
    mutation(value => value.project.tasks[2].deleted = 0);
    for (const dueDate of ['1900-02-29', '2025-02-29', '0000-01-01', '10000-01-01', '2024-04-31', '2024-1-01', ' 2024-01-01 ', null]) {
      mutation(value => value.project.tasks[2].dueDate = dueDate);
    }
    for (const json of invalids) {
      const response = await post('/projects/import', { json, name: '  Retained name  ' });
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.match(html, /role="alert">Invalid project JSON/);
      assert.match(html, /value="  Retained name  "/);
      // JSON source stays in the textarea (HTML escaping is intentional).
      assert.ok(html.includes(json.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))));
      assert.deepEqual(snapshot(), before);
    }
    const blank = await post('/projects/import', { json: JSON.stringify(document), name: ' \t ' });
    assert.match(await blank.text(), /role="alert">Project name is required/);
    assert.deepEqual(snapshot(), before);
    // Extra properties cannot set identities or remembered positions.
    document.project.id = 1;
    document.project.tasks[0].id = 1;
    document.project.tasks[0].position = 999;
    const response = await post('/projects/import', { json: JSON.stringify(document), name: '  Imported  copy  ' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/2');
    const expected = { ...document.project, name: 'Imported  copy', tasks: document.project.tasks.map(({ id, position, ...value }) => ({ ...value, notes: value.notes.replace(/\r\n?/g, '\n') })) };
    delete expected.id;
    assert.deepEqual((await exported(2)).project, expected);
    assert.deepEqual(snapshot().map(rows => rows.filter(row => row.id === 1 || row.task_id === 1)), before);
    const archived = await get('/projects/2?filter=Deleted');
    assert.match(archived, /Archived project/);
    assert.match(archived, /disabled>Restore task/);
    assert.match(archived, /<textarea[^>]*disabled/);
    await post('/projects/2/restore');
    assert.match(await get('/'), /1\/2 completed/);
    const restored = await post('/projects/2/tasks/3/restore', { filter: 'Deleted' });
    assert.match(restored.headers.get('location'), /filter=Deleted/);
    assert.deepEqual((await exported(2)).project.tasks.map(value => value.title), ['  First\t TASK  ', 'Deleted', 'Last']);
    await post('/projects/2/tasks/2/move', { destination: '1' });
    await post('/projects/2/tasks', { title: 'New' });
    await post('/projects/1/tasks/2/rename', { title: 'Changed after move' });
    await post('/projects/1/tasks/2/move', { destination: '2' });
    assert.deepEqual((await exported(2)).project.tasks.map(value => value.title), ['Changed after move', 'Deleted', 'Last', 'New']);
    assert.equal((await exported(2)).project.tasks[0].priority, 'High');
    assert.equal((await exported(2)).project.tasks[3].priority, 'Low');
    assert.equal((await exported(1)).project.tasks[0].title, 'Untouched');
    const empty = structuredClone(document);
    empty.project.tasks = [];
    const emptyResponse = await post('/projects/import', { json: JSON.stringify(empty), name: 'Empty' });
    assert.equal(emptyResponse.headers.get('location'), '/projects/3');
    assert.deepEqual((await exported(3)).project.tasks, []);
    const saved = snapshot();
    await stop(); await start();
    assert.deepEqual(snapshot(), saved);
    assert.equal((await exported(2)).project.tasks[0].notes, task.notes.replace(/\r\n?/g, '\n'));
    assert.equal((await exported(3)).project.archived, true);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
