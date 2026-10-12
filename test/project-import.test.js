import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('validated imports are atomic, independent, ordered and persistent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-import-'));
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let diagnostics = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'workboard.sqlite') },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', (chunk) => { diagnostics += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(diagnostics);
      try {
        const response = await fetch(`${base}/health`);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await new Promise((resolve) => setTimeout(resolve, 25)); }
    }
    throw new Error(`Server did not start: ${diagnostics}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function api(path, method = 'GET', body) {
    const response = await fetch(`${base}/api/projects${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  const read = async (path) => (await api(path)).body;
  const write = async (path, method, body) => {
    const result = await api(path, method, body);
    assert.ok(result.status === 200 || result.status === 201, JSON.stringify(result));
    return result.body;
  };
  const portable = {
    format: 'workboard-project', version: 1,
    project: { name: 'Original', archived: false, defaultPriority: 'Low', tasks: [
      { title: '  FIRST\t  Task Ω  ', completed: true, priority: 'High', dueDate: '2000-02-29',
        notes: '  <script>literal</script> 日本語 📝\r\nnext\rfinal\n  ', deleted: true },
      { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
    ] },
  };
  const imported = async (document, name = '  Copy Ω  ') => api('/import', 'POST', {
    name, document: typeof document === 'string' ? document : JSON.stringify(document),
  });
  try {
    await start();
    const original = await write('', 'POST', { name: 'Original' });
    await write(`/${original.id}/tasks`, 'POST', { title: 'Original task' });
    const before = await read('');
    const beforeTasks = await read(`/${original.id}/tasks`);
    const invalids = ['{', null, [], {}, { ...portable, format: 'other' },
      { ...portable, version: '1' }, { ...portable, version: 1.5 }, { ...portable, version: 2 }];
    for (const key of ['name', 'archived', 'defaultPriority', 'tasks']) {
      const missing = structuredClone(portable);
      delete missing.project[key];
      invalids.push(missing);
    }
    for (const [key, value] of [['name', '  '], ['name', 12], ['archived', 0],
      ['defaultPriority', 'Urgent'], ['tasks', {}]]) {
      const invalid = structuredClone(portable);
      invalid.project[key] = value;
      invalids.push(invalid);
    }
    for (const key of ['title', 'completed', 'priority', 'dueDate', 'notes', 'deleted']) {
      const missing = structuredClone(portable);
      delete missing.project.tasks[1][key];
      invalids.push(missing);
    }
    for (const [key, value] of [['title', '\t '], ['title', null], ['completed', 1],
      ['priority', 'high'], ['dueDate', '1900-02-29'], ['dueDate', '2023-02-29'],
      ['dueDate', '0000-01-01'], ['dueDate', '10000-01-01'], ['dueDate', '2024-04-31'],
      ['dueDate', '2024-1-01'], ['dueDate', ' 2024-01-01 '], ['dueDate', null],
      ['notes', 4], ['deleted', 'false']]) {
      const invalid = structuredClone(portable);
      invalid.project.tasks[1][key] = value;
      invalids.push(invalid);
    }
    for (const invalid of invalids) {
      assert.deepEqual(await imported(invalid), { status: 400, body: { error: 'Invalid project JSON' } });
      assert.deepEqual(await read(''), before);
      assert.deepEqual(await read(`/${original.id}/tasks`), beforeTasks);
    }
    assert.deepEqual(await imported(portable, ' \t '), {
      status: 400, body: { error: 'Project name is required' },
    });
    assert.deepEqual(await read(''), before);
    // Extra identity fields are ignored, never used to overwrite existing records.
    portable.project.id = original.id;
    portable.project.tasks[0].id = beforeTasks[0].id;
    portable.project.tasks[0].project_id = original.id;
    const result = await imported(portable);
    assert.equal(result.status, 201);
    const copy = result.body;
    assert.notEqual(copy.id, original.id);
    assert.equal(copy.name, 'Copy Ω');
    assert.equal(copy.total, 1);
    assert.equal(copy.completed, 0);
    assert.equal(copy.default_priority, 'Low');
    const tasks = await read(`/${copy.id}/tasks`);
    assert.equal(tasks[0].title, portable.project.tasks[0].title);
    assert.notEqual(tasks[0].id, beforeTasks[0].id);
    const expected = structuredClone(portable.project);
    delete expected.id;
    expected.name = 'Copy Ω';
    expected.tasks.forEach((task) => { delete task.id; delete task.project_id; task.notes = task.notes.replace(/\r\n?/g, '\n'); });
    assert.deepEqual((await read(`/${copy.id}/export`)).project, expected);
    const deletedPath = `/${copy.id}/tasks/${tasks[0].id}`;
    for (const edit of [{ completed: false }, { notes: 'changed' }, { destination_project_id: original.id }]) {
      assert.equal((await api(deletedPath, 'PATCH', edit)).status, 409);
    }
    await write(`/${copy.id}`, 'PATCH', { default_priority: 'High' });
    const newTask = await write(`/${copy.id}/tasks`, 'POST', { title: 'Third' });
    assert.equal(newTask.priority, 'High');
    await write(deletedPath, 'PATCH', { deleted: false });
    assert.deepEqual((await read(`/${copy.id}/tasks`)).map((task) => task.id), [tasks[0].id, tasks[1].id, newTask.id]);
    assert.equal((await read(`/${copy.id}`)).completed, 1);
    await write(deletedPath, 'PATCH', { destination_project_id: original.id });
    await write(`/${original.id}/tasks/${tasks[0].id}`, 'PATCH', { destination_project_id: copy.id });
    assert.deepEqual((await read(`/${copy.id}/tasks`)).map((task) => task.id), [tasks[0].id, tasks[1].id, newTask.id]);
    assert.deepEqual(await read(`/${original.id}/tasks`), beforeTasks);
    const archivedDoc = structuredClone(portable);
    archivedDoc.project.archived = true;
    const archived = (await imported(archivedDoc, 'Archived copy')).body;
    const archivedTasks = await read(`/${archived.id}/tasks`);
    assert.equal(archived.archived, true);
    assert.equal((await api(`/${archived.id}/tasks/${archivedTasks[0].id}`, 'PATCH', { deleted: false })).status, 409);
    await write(`/${archived.id}`, 'PATCH', { archived: false });
    await write(`/${archived.id}/tasks/${archivedTasks[0].id}`, 'PATCH', { deleted: false });
    assert.equal((await read(`/${copy.id}/tasks`))[0].notes, tasks[0].notes);
    const empty = structuredClone(portable);
    empty.project.tasks = [];
    const emptyProject = (await imported(empty, 'Empty')).body;
    assert.equal(emptyProject.total, 0);
    assert.deepEqual(await read(`/${emptyProject.id}/tasks`), []);
    await write(`/${archived.id}/tasks/${archivedTasks[0].id}`, 'PATCH', { deleted: true });
    await write(`/${archived.id}`, 'PATCH', { archived: true });
    const snapshotProjects = await read('');
    const snapshotTasks = await read(`/${copy.id}/tasks`);
    const readDirectory = async () => {
      const response = await fetch(`${base}/api/task-directory`);
      assert.equal(response.status, 200);
      return response.json();
    };
    const snapshotDirectory = await readDirectory();
    const expectedDirectory = [];
    for (const project of snapshotProjects) {
      for (const task of await read(`/${project.id}/tasks`)) {
        expectedDirectory.push({ ...task, project_id: project.id,
          project_name: project.name, archived: project.archived });
      }
    }
    assert.deepEqual(snapshotDirectory, expectedDirectory);
    assert.ok(snapshotDirectory.some((task) => task.deleted));
    assert.ok(snapshotDirectory.some((task) => task.archived));
    assert.equal(snapshotDirectory.find((task) => task.id === tasks[0].id).notes, tasks[0].notes);
    assert.equal((await fetch(`${base}/task-directory`)).status, 200);
    assert.deepEqual(await read(''), snapshotProjects);
    assert.deepEqual(await read(`/${copy.id}/tasks`), snapshotTasks);
    await stop();
    await start();
    assert.deepEqual(await read(''), snapshotProjects);
    assert.deepEqual(await read(`/${copy.id}/tasks`), snapshotTasks);
    assert.deepEqual(await readDirectory(), snapshotDirectory);
    await write(deletedPath, 'PATCH', { destination_project_id: original.id });
    assert.equal((await readDirectory()).find((task) => task.id === tasks[0].id).project_id, original.id);
    await write(`/${original.id}/tasks/${tasks[0].id}`, 'PATCH', { destination_project_id: copy.id });
    assert.deepEqual(await read(`/${copy.id}/tasks`), snapshotTasks);
    assert.deepEqual(await readDirectory(), snapshotDirectory);
    await write(`/${copy.id}`, 'PATCH', { name: 'Renamed directory owner' });
    await write(`/${copy.id}`, 'PATCH', { archived: true });
    const archivedDirectory = (await readDirectory()).filter((task) => task.project_id === copy.id);
    assert.deepEqual(archivedDirectory.map((task) => task.id), snapshotTasks.map((task) => task.id));
    assert.ok(archivedDirectory.every((task) => task.archived && task.project_name === 'Renamed directory owner'));
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
