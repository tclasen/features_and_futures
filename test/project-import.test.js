import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateProjectDocument } from '../project-import.js';

const task = { title: '  Original\t TITLE  ', completed: true, priority: 'High',
  dueDate: '2000-02-29', notes: '  日本語 😀 <b>literal</b>\r\nnext\rfinal\n  ', deleted: false };
const portable = () => ({ format: 'workboard-project', version: 1,
  project: { name: 'Original', archived: false, defaultPriority: 'Low',
    tasks: [{ ...task }, { ...task, title: 'Deleted', completed: false, dueDate: '', deleted: true }] } });

function invalidDocuments() {
  const results = ['{', 'null', '[]'];
  for (const [field, value] of [['format', 'other'], ['version', '1'], ['version', 2], ['project', null]]) {
    const doc = portable(); doc[field] = value; results.push(JSON.stringify(doc));
  }
  for (const field of ['format', 'version', 'project']) {
    const doc = portable(); delete doc[field]; results.push(JSON.stringify(doc));
  }
  for (const [field, value] of [['name', ' \t '], ['name', 4], ['archived', 0],
    ['defaultPriority', 'normal'], ['tasks', {}]]) {
    const doc = portable(); doc.project[field] = value; results.push(JSON.stringify(doc));
  }
  for (const field of ['name', 'archived', 'defaultPriority', 'tasks']) {
    const doc = portable(); delete doc.project[field]; results.push(JSON.stringify(doc));
  }
  for (const [field, value] of [['title', '\n '], ['title', 5], ['completed', 1], ['priority', 'Urgent'],
    ['dueDate', '1900-02-29'], ['dueDate', '2025-02-29'], ['dueDate', '0000-01-01'],
    ['dueDate', '10000-01-01'], ['dueDate', '2024-04-31'], ['dueDate', '2024-1-01'],
    ['dueDate', ' 2000-02-29 '], ['dueDate', ' '], ['dueDate', null], ['notes', null], ['deleted', 0]]) {
    const doc = portable(); doc.project.tasks[1][field] = value; results.push(JSON.stringify(doc));
  }
  for (const field of Object.keys(task)) {
    const doc = portable(); delete doc.project.tasks[1][field]; results.push(JSON.stringify(doc));
  }
  const doc = portable(); doc.project.tasks.push(null); results.push(JSON.stringify(doc));
  return results;
}

test('portable import validates complete required fields and Gregorian dates', () => {
  for (const source of invalidDocuments()) assert.equal(validateProjectDocument(source), null, source);
  assert.deepEqual(validateProjectDocument(JSON.stringify(portable())), portable().project);
  for (const dueDate of ['', '0001-01-01', '9999-12-31', '2024-02-29']) {
    const doc = portable(); doc.project.tasks[0].dueDate = dueDate;
    assert.ok(validateProjectDocument(JSON.stringify(doc)));
  }
  const empty = portable(); empty.project.tasks = [];
  assert.ok(validateProjectDocument(JSON.stringify(empty)));
});

test('import is atomic, independent and persistent with reserved order and archive restrictions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-import-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let child;
  let origin;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      let output = ''; let errors = '';
      const timeout = setTimeout(() => reject(new Error(`Startup timed out: ${errors}`)), 5000);
      child.stderr.on('data', chunk => { errors += chunk; });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${errors}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { origin = `http://127.0.0.1:${match[1]}`; clearTimeout(timeout); resolve(); }
      });
    });
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM'); await exited;
    }
  }
  async function request(path, method = 'GET', body, status = 200) {
    const response = await fetch(`${origin}${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, status);
    return response.json();
  }
  const importProject = (document, name = '  Copy  ', status = 201) =>
    request('/api/projects/import', 'POST', { document: JSON.stringify(document), name }, status);
  try {
    await start();
    assert.deepEqual(await request('/health'), { status: 'ok' });
    const original = await request('/api/projects', 'POST', { name: 'Original' }, 201);
    const originalTask = await request(`/api/projects/${original.id}/tasks`, 'POST', { title: 'Original task' }, 201);
    const before = await request('/api/projects');
    for (const document of invalidDocuments()) {
      assert.deepEqual(await request('/api/projects/import', 'POST', { document, name: 'Copy' }, 400),
        { error: 'Invalid project JSON' });
      assert.deepEqual(await request('/api/projects'), before);
      assert.deepEqual(await request(`/api/projects/${original.id}/tasks`), [originalTask]);
    }
    assert.deepEqual(await importProject(portable(), ' \n ', 400), { error: 'Project name is required' });
    const doc = portable();
    doc.project.id = original.id;
    doc.project.tasks.forEach(t => { t.id = originalTask.id; t.project_id = original.id; t.position = 99; });
    const imported = await importProject(doc);
    assert.equal(imported.name, 'Copy');
    assert.notEqual(imported.id, original.id);
    assert.equal(imported.total, 1); assert.equal(imported.completed, 1);
    const base = `/api/projects/${imported.id}`;
    const saved = await request(`${base}/tasks`);
    assert.equal(saved[0].title, task.title);
    assert.equal(saved[0].notes, task.notes.replace(/\r\n?/g, '\n'));
    assert.notEqual(saved[0].id, originalTask.id);
    assert.deepEqual(saved.map(t => t.deleted), [false, true]);
    const expected = portable(); expected.project.name = 'Copy';
    expected.project.tasks.forEach(t => { t.notes = t.notes.replace(/\r\n?/g, '\n'); });
    assert.deepEqual(await request(`${base}/export`), expected);
    assert.deepEqual(await request(`/api/projects/${original.id}/tasks`), [originalTask]);
    await request(`${base}/tasks/${saved[1].id}`, 'PATCH', { notes: 'blocked' }, 409);
    const appended = await request(`${base}/tasks`, 'POST', { title: 'Later' }, 201);
    assert.equal(appended.priority, 'Low');
    await request(`${base}/tasks/${saved[1].id}`, 'PATCH', { deleted: false });
    assert.deepEqual((await request(`${base}/tasks`)).map(t => t.id), [saved[0].id, saved[1].id, appended.id]);
    await request(`${base}/tasks/${saved[0].id}`, 'PATCH', { destination_project_id: original.id });
    await request(`/api/projects/${original.id}/tasks/${saved[0].id}`, 'PATCH', { title: 'Current title' });
    await request(`/api/projects/${original.id}/tasks/${saved[0].id}`, 'PATCH', { destination_project_id: imported.id });
    const returned = await request(`${base}/tasks`);
    assert.deepEqual(returned.map(t => t.id), [saved[0].id, saved[1].id, appended.id]);
    assert.equal(returned[0].title, 'Current title');
    assert.equal(returned[0].notes, saved[0].notes);
    const archivedDoc = portable(); archivedDoc.project.archived = true;
    const archived = await importProject(archivedDoc, 'Archived copy');
    const archivedBase = `/api/projects/${archived.id}`;
    const archivedTasks = await request(`${archivedBase}/tasks`);
    await request(`${archivedBase}/tasks/${archivedTasks[1].id}`, 'PATCH', { deleted: false }, 409);
    const emptyDoc = portable(); emptyDoc.project.tasks = [];
    const empty = await importProject(emptyDoc, 'Empty');
    assert.equal(empty.total, 0);
    const largeDoc = portable();
    largeDoc.project.tasks[0].notes = '日本語 😀\n'.repeat(10000);
    const large = await importProject(largeDoc, 'Large notes');
    assert.equal((await request(`/api/projects/${large.id}/tasks`))[0].notes, largeDoc.project.tasks[0].notes);
    await stop(); await start();
    assert.deepEqual(await request(`${base}/tasks`), returned);
    assert.deepEqual(await request(`${archivedBase}/tasks`), archivedTasks);
    assert.equal((await request(archivedBase)).archived, 1);
    await request(archivedBase, 'PATCH', { archived: false });
    await request(`${archivedBase}/tasks/${archivedTasks[1].id}`, 'PATCH', { deleted: false });
    assert.equal((await request(archivedBase)).total, 2);
    assert.deepEqual(await request(`/api/projects/${original.id}/tasks`), [originalTask]);
  } finally { await stop(); await rm(directory, { recursive: true, force: true }); }
});
