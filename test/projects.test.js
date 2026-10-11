import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function portableProject() {
  return {
    format: 'workboard-project', version: 1,
    project: {
      name: '  Original  name  ', archived: false, defaultPriority: 'High',
      tasks: [
        { title: '  First  task\t日本語  ', completed: true, priority: 'Low',
          dueDate: '2000-02-29', notes: '  <b>literal</b>\r\nUnicode café\r尾  ', deleted: false },
        { title: 'Deleted task', completed: true, priority: 'Normal',
          dueDate: '', notes: '', deleted: true },
      ],
    },
  };
}

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const url = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 10000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolveUrl(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
  });
  return { url, async stop() {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  } };
}

test('project import validates every required field atomically and retains original data', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'import-validation-'));
  const server = await start(resolve(directory, 'workboard.sqlite'));
  try {
    const get = async path => (await fetch(server.url + path)).json();
    const post = async (path, body) => fetch(server.url + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const original = await (await post('/api/projects', { name: 'Keep original' })).json();
    const taskPath = `/api/projects/${original.id}/tasks`;
    await post(taskPath, { title: 'Keep task' });
    const projectsBefore = await get('/api/projects');
    const tasksBefore = await get(taskPath);
    const invalid = ['{bad', 'null', '[]', '{}'];
    const add = mutate => {
      const document = portableProject();
      mutate(document);
      invalid.push(JSON.stringify(document));
    };
    for (const key of ['format', 'version', 'project']) add(doc => { delete doc[key]; });
    for (const value of ['other', 1, null]) add(doc => { doc.format = value; });
    for (const value of ['1', true, 0, 2, 1.5, null]) add(doc => { doc.version = value; });
    for (const value of [null, [], 'project']) add(doc => { doc.project = value; });
    for (const key of ['name', 'archived', 'defaultPriority', 'tasks']) add(doc => { delete doc.project[key]; });
    for (const value of ['', ' \t\n ', 3, null]) add(doc => { doc.project.name = value; });
    for (const value of [0, 'false', null]) add(doc => { doc.project.archived = value; });
    for (const value of ['high', '', null, 1]) add(doc => { doc.project.defaultPriority = value; });
    for (const value of [null, {}, 'tasks']) add(doc => { doc.project.tasks = value; });
    // Mutate the later task: an earlier valid task must never be partly imported.
    for (const key of ['title', 'completed', 'priority', 'dueDate', 'notes', 'deleted']) {
      add(doc => { delete doc.project.tasks[1][key]; });
    }
    for (const value of [null, [], 'task']) add(doc => { doc.project.tasks[1] = value; });
    for (const value of ['', ' \t\n ', 3, null]) add(doc => { doc.project.tasks[1].title = value; });
    for (const key of ['completed', 'deleted']) {
      for (const value of [0, 1, 'true', null]) add(doc => { doc.project.tasks[1][key] = value; });
    }
    for (const value of ['normal', '', null, 1]) add(doc => { doc.project.tasks[1].priority = value; });
    for (const value of [null, 2, {}, []]) add(doc => { doc.project.tasks[1].notes = value; });
    for (const value of [null, 2, ' ', ' 2024-02-29 ', '0000-01-01', '10000-01-01',
      '1900-02-29', '2100-02-29', '2023-02-29', '2024-04-31', '2024-00-01',
      '2024-13-01', '2024-01-00', '2024-01-32', '2024-2-29', '2024-02-29T00:00:00Z']) {
      add(doc => { doc.project.tasks[1].dueDate = value; });
    }
    for (const document of invalid) {
      const response = await post('/api/projects/import', { name: 'Copy', document });
      assert.equal(response.status, 400, document);
      assert.deepEqual(await response.json(), { error: 'Invalid project JSON' });
      assert.deepEqual(await get('/api/projects'), projectsBefore);
      assert.deepEqual(await get(taskPath), tasksBefore);
    }
    for (const name of ['', ' \t\n ']) {
      for (const document of [JSON.stringify(portableProject()), 'invalid']) {
        const response = await post('/api/projects/import', { name, document });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { error: 'Project name is required' });
      }
    }
    for (const document of [undefined, null, portableProject()]) {
      const response = await post('/api/projects/import', { name: 'Copy', document });
      assert.deepEqual(await response.json(), { error: 'Invalid project JSON' });
    }
    const malformed = await fetch(server.url + '/api/projects/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: 'Invalid project JSON' });
    assert.deepEqual(await get('/api/projects'), projectsBefore);
    assert.deepEqual(await get(taskPath), tasksBefore);
  } finally {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('imports create independent persistent projects with exact fields, order, archive and deletion rules', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'import-persistence-'));
  const databasePath = resolve(directory, 'workboard.sqlite');
  let server = await start(databasePath);
  try {
    const get = async path => (await fetch(server.url + path)).json();
    const write = async (path, body, method = 'POST') => fetch(server.url + path, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const importProject = async (document, name) => {
      const response = await write('/api/projects/import', { name, document: JSON.stringify(document) });
      assert.equal(response.status, 201);
      return response.json();
    };
    const original = await (await write('/api/projects', { name: 'Original' })).json();
    const originalTasks = `/api/projects/${original.id}/tasks`;
    const originalTask = await (await write(originalTasks, { title: 'Original task' })).json();
    const document = portableProject();
    // Unknown properties, including internal identities and ordering, have no authority.
    document.project.id = original.id;
    document.project.position = 1;
    document.project.tasks[0].id = originalTask.id;
    document.project.tasks[0].project_id = original.id;
    document.project.tasks[0].position = 999;
    document.project.tasks.push({ title: 'Last', completed: false, priority: 'High',
      dueDate: '9999-12-31', notes: '日本語🙂'.repeat(10000), deleted: false });
    const copy = await importProject(document, '  Imported  copy  ');
    const copyPath = `/api/projects/${copy.id}`;
    const copyTasks = `${copyPath}/tasks`;
    assert.notEqual(copy.id, original.id);
    assert.equal(copy.name, 'Imported  copy');
    assert.equal(copy.default_task_priority, 'High');
    assert.equal(copy.total, 2);
    assert.equal(copy.completed, 1);
    const importedTasks = await get(copyTasks);
    assert.equal(new Set(importedTasks.map(task => task.id)).size, 3);
    assert.ok(importedTasks.every(task => task.id !== originalTask.id));
    const expected = { format: 'workboard-project', version: 1, project: {
      name: copy.name, archived: false, defaultPriority: 'High',
      tasks: document.project.tasks.map(({ title, completed, priority, dueDate, notes, deleted }) =>
        ({ title, completed, priority, dueDate, notes: notes.replace(/\r\n?/g, '\n'), deleted })),
    } };
    assert.deepEqual(await get(`${copyPath}/export`), expected);
    const archivedDocument = structuredClone(expected);
    archivedDocument.project.archived = true;
    const archived = await importProject(archivedDocument, 'Archived copy');
    const archivedPath = `/api/projects/${archived.id}`;
    const archivedTasks = await get(`${archivedPath}/tasks`);
    assert.equal((await write(`${archivedPath}/tasks/${archivedTasks[1].id}`, { deleted: false }, 'PATCH')).status, 409);
    assert.equal((await write(`${archivedPath}/tasks`, { title: 'Blocked' })).status, 409);
    const emptyDocument = portableProject();
    emptyDocument.project.tasks = [];
    const empty = await importProject(emptyDocument, 'Empty copy');
    assert.equal(empty.total, 0);
    assert.deepEqual(await get(`/api/projects/${empty.id}/tasks`), []);
    const deletedDocument = portableProject();
    deletedDocument.project.tasks.forEach(task => { task.deleted = true; });
    const deletedOnly = await importProject(deletedDocument, 'Only deleted');
    assert.equal(deletedOnly.total, 0);
    assert.equal(deletedOnly.completed, 0);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await get(copyTasks), importedTasks);
    assert.deepEqual(await get(copyPath), copy);
    assert.deepEqual(await get(`${archivedPath}/tasks`), archivedTasks);
    assert.deepEqual(await get(`${copyPath}/export`), expected);
    const update = async (path, body) => {
      const response = await write(path, body, 'PATCH');
      assert.equal(response.status, 200);
      return response.json();
    };
    const deletedTaskPath = `${copyTasks}/${importedTasks[1].id}`;
    assert.equal((await write(deletedTaskPath, { destination_project_id: original.id }, 'PATCH')).status, 409);
    await update(copyPath, { default_task_priority: 'Low' });
    await write(copyTasks, { title: 'New after reserved positions' });
    await update(deletedTaskPath, { deleted: false });
    let current = await get(copyTasks);
    assert.deepEqual(current.slice(0, 3).map(task => task.id), importedTasks.map(task => task.id));
    assert.deepEqual(current[1], { ...importedTasks[1], deleted: false });
    assert.equal((await get(copyPath)).completed, 2);
    assert.equal((await get(copyPath)).total, 4);
    // Imported positions participate in ordinary moves and reverse-order returns.
    for (const task of importedTasks.slice(0, 2)) {
      await update(`${copyTasks}/${task.id}`, { destination_project_id: original.id });
    }
    for (const task of importedTasks.slice(0, 2).reverse()) {
      await update(`${originalTasks}/${task.id}`, { destination_project_id: copy.id });
    }
    current = await get(copyTasks);
    assert.deepEqual(current.slice(0, 3).map(task => task.id), importedTasks.map(task => task.id));
    await update(`${copyTasks}/${importedTasks[0].id}`, { title: 'Changed copy only' });
    await update(archivedPath, { archived: false });
    await update(`${archivedPath}/tasks/${archivedTasks[1].id}`, { deleted: false });
    assert.deepEqual(await get(originalTasks), [originalTask]);
    assert.deepEqual(await get(`/api/projects/${original.id}`), { ...original, total: 1 });
    assert.equal((await get(`${archivedPath}/tasks`))[0].title, importedTasks[0].title);
    await server.stop();
    server = await start(databasePath);
    current[0].title = 'Changed copy only';
    assert.deepEqual(await get(copyTasks), current);
    assert.equal((await get(archivedPath)).archived, false);
    assert.equal((await get(`${archivedPath}/tasks`))[1].deleted, false);
    assert.deepEqual(await get(originalTasks), [originalTask]);
  } finally {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects and tasks validate, stay isolated, and survive a restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'test-'));
  const databasePath = resolve(directory, 'projects.sqlite');
  let server;
  try {
    // Upgrade a database with the schema used before archive support.
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`CREATE TABLE projects (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL
    ); INSERT INTO projects (id, name) VALUES ('legacy', 'Existing project');
    CREATE TABLE tasks (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    ); INSERT INTO tasks (id, project_id, title, completed)
      VALUES ('legacy-task', 'legacy', 'Existing task', 1)`);
    legacy.close();
    server = await start(databasePath);
    const get = async path => {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      return response.json();
    };
    const create = name => fetch(server.url + '/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    assert.deepEqual(await get('/health'), { status: 'ok' });
    const existing = { id: 'legacy', name: 'Existing project', archived: false, default_task_priority: 'Normal', total: 1, completed: 1 };
    assert.deepEqual(await get('/api/projects'), [existing]);
    const legacyTasks = [{ id: 'legacy-task', title: 'Existing task', completed: true, priority: 'Normal', due_date: '', notes: '', deleted: false }];
    assert.deepEqual(await get('/api/projects/legacy/tasks'), legacyTasks);
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await get('/api/projects'), [existing]);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.ok(first.id);
    const secondResponse = await create('Second project');
    const second = await secondResponse.json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.equal(first.archived, false);
    assert.equal(first.total, 0);
    assert.equal(first.completed, 0);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    const firstTasks = `/api/projects/${first.id}/tasks`;
    const secondTasks = `/api/projects/${second.id}/tasks`;
    const createTask = (path, title) => fetch(server.url + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const completeTask = (path, completed) => fetch(server.url + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    assert.deepEqual(await get(firstTasks), []);
    for (const title of ['', ' \t\n ']) {
      const response = await createTask(firstTasks, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await get(firstTasks), []);
    const taskResponse = await createTask(firstTasks, '  First task  ');
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.ok(firstTask.id);
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    assert.equal(firstTask.priority, 'Normal');
    const nextTaskResponse = await createTask(firstTasks, 'Second task');
    const secondTask = await nextTaskResponse.json();
    assert.notEqual(firstTask.id, secondTask.id);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    assert.deepEqual(await get(secondTasks), []);
    const otherTaskResponse = await createTask(secondTasks, 'Other project task');
    const otherTask = await otherTaskResponse.json();
    assert.equal(secondTask.priority, 'Normal');
    assert.equal(otherTask.priority, 'Normal');
    assert.deepEqual(await get(secondTasks), [otherTask]);
    const wrongProject = await completeTask(`${secondTasks}/${firstTask.id}`, true);
    assert.equal(wrongProject.status, 404);
    const invalidCompletion = await completeTask(`${firstTasks}/${firstTask.id}`, 'true');
    assert.equal(invalidCompletion.status, 400);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    const completion = await completeTask(`${firstTasks}/${firstTask.id}`, true);
    assert.equal(completion.status, 200);
    firstTask.completed = true;
    assert.deepEqual(await completion.json(), firstTask);
    const reopened = await completeTask(`${firstTasks}/${firstTask.id}`, false);
    assert.equal(reopened.status, 200);
    firstTask.completed = false;
    assert.deepEqual(await reopened.json(), firstTask);
    await completeTask(`${firstTasks}/${firstTask.id}`, true);
    firstTask.completed = true;
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    assert.deepEqual(await get(secondTasks), [otherTask]);
    const unknownProject = await createTask('/api/projects/missing/tasks', 'Orphan');
    assert.equal(unknownProject.status, 404);
    first.total = 2;
    first.completed = 1;
    second.total = 1;
    const setPriority = (path, priority) => fetch(server.url + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    });
    assert.equal((await setPriority(`${secondTasks}/${firstTask.id}`, 'High')).status, 404);
    for (const priority of ['', 'high', 'Urgent', null, 123]) {
      assert.equal((await setPriority(`${firstTasks}/${firstTask.id}`, priority)).status, 400);
      assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    }
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await setPriority(`${firstTasks}/${firstTask.id}`, priority);
      assert.equal(response.status, 200);
      firstTask.priority = priority;
      assert.deepEqual(await response.json(), firstTask);
      assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
      assert.deepEqual(await get(secondTasks), [otherTask]);
      assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    }
    assert.equal((await setPriority(`${firstTasks}/${secondTask.id}`, 'Low')).status, 200);
    secondTask.priority = 'Low';
    const renameTask = (path, title) => fetch(server.url + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    assert.equal((await renameTask(`${secondTasks}/${firstTask.id}`, 'Wrong owner')).status, 404);
    for (const title of ['', ' \t\n ', null, 123]) {
      const response = await renameTask(`${firstTasks}/${firstTask.id}`, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    }
    const renamedTask = await renameTask(`${firstTasks}/${firstTask.id}`, '  Renamed \t completed  TASK  ');
    assert.equal(renamedTask.status, 200);
    firstTask.title = 'Renamed \t completed  TASK';
    assert.deepEqual(await renamedTask.json(), firstTask);
    const renamedOpenTask = await renameTask(`${firstTasks}/${secondTask.id}`, '  Renamed open task  ');
    assert.equal(renamedOpenTask.status, 200);
    secondTask.title = 'Renamed open task';
    assert.deepEqual(await renamedOpenTask.json(), secondTask);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    assert.deepEqual(await get(secondTasks), [otherTask]);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    const rename = name => fetch(server.url + `/api/projects/${first.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    for (const name of ['', ' \t\n ', null, 123]) {
      const response = await rename(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    }
    const renamed = await rename('  Renamed \t PROJECT  ');
    assert.equal(renamed.status, 200);
    first.name = 'Renamed \t PROJECT';
    assert.deepEqual(await renamed.json(), first);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    const setArchived = archived => fetch(server.url + `/api/projects/${first.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    assert.equal((await setArchived('true')).status, 400);
    const archiveResponse = await setArchived(true);
    assert.equal(archiveResponse.status, 200);
    first.archived = true;
    assert.deepEqual(await archiveResponse.json(), first);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.equal((await createTask(firstTasks, 'Blocked')).status, 409);
    assert.equal((await completeTask(`${firstTasks}/${firstTask.id}`, false)).status, 409);
    assert.equal((await renameTask(`${firstTasks}/${firstTask.id}`, 'Blocked task rename')).status, 409);
    assert.equal((await setPriority(`${firstTasks}/${firstTask.id}`, 'Low')).status, 409);
    assert.equal((await rename('Blocked rename')).status, 409);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(server.url + path);
      assert.equal(response.status, 200);
      const page = await response.text();
      assert.match(page, /<h1>Workboard<\/h1>/);
      assert.match(page, /<label for="project-name">Project name<\/label>/);
      assert.match(page, /Create project/);
      assert.match(page, /role="alert"/);
      assert.match(page, /<label for="new-project-name">New project name<\/label>/);
      assert.match(page, /Rename project/);
    }
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await get('/api/projects/legacy/tasks'), legacyTasks);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.deepEqual(await get(`/api/projects/${first.id}`), first);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    assert.deepEqual(await get(secondTasks), [otherTask]);
    assert.equal((await createTask(firstTasks, 'Still blocked')).status, 409);
    assert.equal((await renameTask(`${firstTasks}/${firstTask.id}`, 'Still blocked rename')).status, 409);
    assert.equal((await setPriority(`${firstTasks}/${firstTask.id}`, 'Normal')).status, 409);
    const restored = await setArchived(false);
    first.archived = false;
    assert.equal(restored.status, 200);
    assert.deepEqual(await restored.json(), first);
    assert.equal((await setPriority(`${firstTasks}/${firstTask.id}`, 'Low')).status, 200);
    firstTask.priority = 'Low';
    const renamedAfterRestoration = await rename('  Restored and renamed  ');
    assert.equal(renamedAfterRestoration.status, 200);
    first.name = 'Restored and renamed';
    assert.deepEqual(await renamedAfterRestoration.json(), first);
    const taskRenamedAfterRestoration = await renameTask(`${firstTasks}/${firstTask.id}`, '  Restored task  ');
    assert.equal(taskRenamedAfterRestoration.status, 200);
    firstTask.title = 'Restored task';
    assert.deepEqual(await taskRenamedAfterRestoration.json(), firstTask);
    const reopenedAfterRestart = await completeTask(`${firstTasks}/${firstTask.id}`, false);
    assert.equal(reopenedAfterRestart.status, 200);
    firstTask.completed = false;
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
    first.completed = 0;
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    await server.stop();
    server = undefined;
    server = await start(databasePath);
    assert.deepEqual(await get('/api/projects'), [existing, first, second]);
    assert.deepEqual(await get(firstTasks), [firstTask, secondTask]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults affect only future tasks and persist through rename, archive, restore, and restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'defaults-test-'));
  let server;
  try {
    const databasePath = resolve(directory, 'defaults.sqlite');
    server = await start(databasePath);
    const api = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(server.url + path, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      assert.equal(response.status, status);
      return response.json();
    };
    const first = await api('/api/projects', 'POST', { name: 'First' }, 201);
    const second = await api('/api/projects', 'POST', { name: 'Second' }, 201);
    const path = `/api/projects/${first.id}`;
    const otherPath = `/api/projects/${second.id}`;
    assert.equal(first.default_task_priority, 'Normal');
    assert.equal(second.default_task_priority, 'Normal');
    const original = await api(`${path}/tasks`, 'POST', { title: 'Original' }, 201);
    assert.equal(original.priority, 'Normal');
    for (const invalid of ['', 'high', 'Urgent', null, 123]) {
      await api(path, 'PATCH', { default_task_priority: invalid }, 400);
      assert.equal((await api(path)).default_task_priority, 'Normal');
    }
    await api(path, 'PATCH', { default_task_priority: 'High' });
    const inherited = await api(`${path}/tasks`, 'POST', { title: 'Inherited' }, 201);
    assert.equal(inherited.priority, 'High');
    await api(`${path}/tasks/${inherited.id}`, 'PATCH', { completed: true });
    inherited.completed = true;
    await api(`${path}/tasks/${inherited.id}`, 'PATCH', { title: 'Renamed task' });
    inherited.title = 'Renamed task';
    const unchanged = [original, inherited];
    await api(path, 'PATCH', { default_task_priority: 'Low' });
    assert.deepEqual(await api(`${path}/tasks`), unchanged);
    assert.equal((await api(otherPath)).default_task_priority, 'Normal');
    const otherTask = await api(`${otherPath}/tasks`, 'POST', { title: 'Other' }, 201);
    assert.equal(otherTask.priority, 'Normal');
    await api(otherPath, 'PATCH', { default_task_priority: 'High' });
    await api(path, 'PATCH', { name: 'Renamed project' });
    const renamed = await api(path);
    assert.equal(renamed.default_task_priority, 'Low');
    assert.equal(renamed.completed, 1);
    assert.equal(renamed.total, 2);
    await api(path, 'PATCH', { archived: true });
    await api(path, 'PATCH', { default_task_priority: 'Normal' }, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await api(path), { ...renamed, archived: true });
    assert.deepEqual(await api(`${path}/tasks`), unchanged);
    assert.equal((await api(otherPath)).default_task_priority, 'High');
    await api(path, 'PATCH', { archived: false });
    const lowTask = await api(`${path}/tasks`, 'POST', { title: 'After restoration' }, 201);
    assert.equal(lowTask.priority, 'Low');
    await api(path, 'PATCH', { default_task_priority: 'Normal' });
    assert.deepEqual(await api(`${path}/tasks`), [...unchanged, lowTask]);
    assert.deepEqual(await api(`${otherPath}/tasks`), [otherTask]);
    await server.stop();
    server = await start(databasePath);
    assert.equal((await api(path)).default_task_priority, 'Normal');
    assert.deepEqual(await api(`${path}/tasks`), [...unchanged, lowTask]);
    assert.deepEqual((await api('/api/projects')).map(project => project.id), [first.id, second.id]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates validate calendar days and persist independently through edits, archive, and restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'dates-test-'));
  let server;
  try {
    const databasePath = resolve(directory, 'dates.sqlite');
    server = await start(databasePath);
    const api = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(server.url + path, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      assert.equal(response.status, status);
      return response.json();
    };
    const project = await api('/api/projects', 'POST', { name: 'Dates' }, 201);
    const other = await api('/api/projects', 'POST', { name: 'Other' }, 201);
    const path = `/api/projects/${project.id}`;
    const task = await api(`${path}/tasks`, 'POST', { title: 'First' }, 201);
    const second = await api(`${path}/tasks`, 'POST', { title: 'Second' }, 201);
    const taskPath = `${path}/tasks/${task.id}`;
    assert.equal(task.due_date, '');
    assert.equal(second.due_date, '');
    await api(taskPath, 'PATCH', { completed: true });
    task.completed = true;
    await api(taskPath, 'PATCH', { priority: 'High' });
    task.priority = 'High';
    const summary = await api(path);
    for (const date of ['0001-01-01', '0004-02-29', '2000-02-29', '2024-02-29', '9999-12-31']) {
      const saved = await api(taskPath, 'PATCH', { due_date: `  ${date} \t` });
      task.due_date = date;
      assert.deepEqual(saved, task);
      assert.deepEqual(await api(`${path}/tasks`), [task, second]);
      assert.deepEqual(await api(path), summary);
    }
    for (const date of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29',
      '2023-02-29', '2024-04-31', '2024-00-01', '2024-13-01', '2024-01-00',
      '2024-01-32', '2024-1-01', '24-01-01', '2024-01-01T00:00:00Z', 'invalid', null, 20240101]) {
      assert.deepEqual(await api(taskPath, 'PATCH', { due_date: date }, 400), {
        error: 'Due date must be a valid YYYY-MM-DD date',
      });
      assert.deepEqual(await api(`${path}/tasks`), [task, second]);
      assert.deepEqual(await api(path), summary);
    }
    await api(`/api/projects/${other.id}/tasks/${task.id}`, 'PATCH', { due_date: '2024-01-01' }, 404);
    await api(taskPath, 'PATCH', { title: 'Renamed' });
    task.title = 'Renamed';
    assert.deepEqual(await api(`${path}/tasks`), [task, second]);
    await api(path, 'PATCH', { archived: true });
    await api(taskPath, 'PATCH', { due_date: '' }, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await api(`${path}/tasks`), [task, second]);
    await api(taskPath, 'PATCH', { due_date: '2025-01-01' }, 409);
    await api(path, 'PATCH', { archived: false });
    assert.deepEqual(await api(path), summary);
    for (const date of ['', ' \t\n ']) {
      task.due_date = '';
      assert.deepEqual(await api(taskPath, 'PATCH', { due_date: date }), task);
      await server.stop();
      server = await start(databasePath);
      assert.deepEqual(await api(`${path}/tasks`), [task, second]);
    }
    await api(`${path}/tasks/${second.id}`, 'PATCH', { due_date: '2026-10-11' });
    second.due_date = '2026-10-11';
    assert.deepEqual(await api(`${path}/tasks`), [task, second]);
    assert.deepEqual(await api(path), summary);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moves append first arrivals, restore returning order, preserve data and summaries, and survive restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'moves-'));
  let server;
  try {
    const databasePath = resolve(directory, 'moves.sqlite');
    server = await start(databasePath);
    const api = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(server.url + '/api/projects' + path, {
        method, ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      assert.equal(response.status, status);
      return response.json();
    };
    const source = await api('', 'POST', { name: 'Source' }, 201);
    const destination = await api('', 'POST', { name: 'Destination' }, 201);
    const sourcePath = `/${source.id}`;
    const destinationPath = `/${destination.id}`;
    // Create the moved task first to ensure moving really changes its order.
    const moved = await api(sourcePath + '/tasks', 'POST', { title: 'Moved' }, 201);
    const remaining = await api(sourcePath + '/tasks', 'POST', { title: 'Remaining' }, 201);
    const existing = await api(destinationPath + '/tasks', 'POST', { title: 'Existing' }, 201);
    const taskPath = sourcePath + '/tasks/' + moved.id;
    await api(taskPath, 'PATCH', { completed: true });
    await api(taskPath, 'PATCH', { priority: 'High' });
    const saved = await api(taskPath, 'PATCH', { due_date: '0001-01-01' });
    await api(destinationPath, 'PATCH', { default_task_priority: 'Low' });
    for (const id of [source.id, 'missing', null]) {
      await api(taskPath, 'PATCH', { destination_project_id: id }, 400);
    }
    await api(destinationPath, 'PATCH', { archived: true });
    await api(taskPath, 'PATCH', { destination_project_id: destination.id }, 400);
    await api(destinationPath, 'PATCH', { archived: false });
    await api(sourcePath, 'PATCH', { archived: true });
    await api(taskPath, 'PATCH', { destination_project_id: destination.id }, 409);
    await api(sourcePath, 'PATCH', { archived: false });
    assert.deepEqual(await api(taskPath, 'PATCH', { destination_project_id: destination.id }), saved);
    assert.deepEqual(await api(sourcePath + '/tasks'), [remaining]);
    assert.deepEqual(await api(destinationPath + '/tasks'), [existing, saved]);
    const afterMove = await api(destinationPath + '/tasks', 'POST', { title: 'After move' }, 201);
    assert.equal(afterMove.priority, 'Low');
    assert.deepEqual(await api(destinationPath + '/tasks'), [existing, saved, afterMove]);
    const summaries = await api('');
    assert.deepEqual(summaries.map(p => [p.completed, p.total]), [[0, 1], [1, 3]]);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await api(destinationPath + '/tasks'), [existing, saved, afterMove]);
    assert.deepEqual(await api(''), summaries);
    await api(destinationPath + '/tasks/' + moved.id, 'PATCH', { destination_project_id: source.id });
    assert.deepEqual(await api(sourcePath + '/tasks'), [saved, remaining]);
    // Blank dates also survive moving independently.
    await api(sourcePath + '/tasks/' + remaining.id, 'PATCH', { destination_project_id: destination.id });
    assert.deepEqual(await api(destinationPath + '/tasks'), [existing, afterMove, remaining]);
    await api(taskPath, 'PATCH', { title: 'Renamed after move' });
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await api(sourcePath + '/tasks'), [{ ...saved, title: 'Renamed after move' }]);
    assert.deepEqual(await api(destinationPath + '/tasks'), [existing, afterMove, remaining]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('remembered positions migrate existing order and survive reverse returns, edits, and restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'return-order-'));
  const databasePath = resolve(directory, 'order.sqlite');
  let server;
  try {
    // Task 011 can leave sparse global positions after moves. Preserve that order.
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`CREATE TABLE projects (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL
    ); INSERT INTO projects (id, name) VALUES ('a', 'Source'), ('b', 'Destination'), ('c', 'Third');
    CREATE TABLE tasks (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    ); INSERT INTO tasks (position, id, project_id, title) VALUES
      (10, 'first', 'a', 'First'), (30, 'middle', 'a', 'Middle'),
      (50, 'last', 'a', 'Last'), (60, 'existing', 'b', 'Existing')`);
    legacy.close();
    server = await start(databasePath);
    const api = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(server.url + '/api/projects/' + path, {
        method, ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      assert.equal(response.status, status);
      return response.json();
    };
    const ids = async project => (await api(project + '/tasks')).map(task => task.id);
    const move = (task, from, to, status = 200) => api(`${from}/tasks/${task}`, 'PATCH',
      { destination_project_id: to }, status);
    assert.deepEqual(await ids('a'), ['first', 'middle', 'last']);
    await move('first', 'a', 'b');
    await move('middle', 'a', 'b');
    await move('last', 'a', 'b');
    assert.deepEqual(await ids('b'), ['existing', 'first', 'middle', 'last']);
    // With every original task away, new tasks must still follow their reserved positions.
    const newSource = await api('a/tasks', 'POST', { title: 'New source task' }, 201);
    const newDestination = await api('b/tasks', 'POST', { title: 'New destination task' }, 201);
    await api('a', 'PATCH', { name: 'Renamed source' });
    await api('a', 'PATCH', { default_task_priority: 'Low' });
    await api('a', 'PATCH', { archived: true });
    await move('middle', 'b', 'a', 400);
    await api('b', 'PATCH', { archived: true });
    await move('middle', 'b', 'c', 409);
    await server.stop();
    server = await start(databasePath);
    await api('a', 'PATCH', { archived: false });
    await api('b', 'PATCH', { archived: false });
    await api('b/tasks/middle', 'PATCH', { title: 'Current middle title' });
    await api('b/tasks/middle', 'PATCH', { completed: true });
    await api('b/tasks/middle', 'PATCH', { priority: 'High' });
    const currentMiddle = await api('b/tasks/middle', 'PATCH', { due_date: '2024-02-29' });
    // Return in reverse order, including a stop at a third project.
    await move('last', 'b', 'a');
    await move('middle', 'b', 'c');
    await move('middle', 'c', 'a');
    await move('first', 'b', 'a');
    assert.deepEqual(await ids('a'), ['first', 'middle', 'last', newSource.id]);
    assert.deepEqual((await api('a/tasks'))[1], currentMiddle);
    assert.deepEqual(await ids('b'), ['existing', newDestination.id]);
    assert.deepEqual(await ids('c'), []);
    assert.equal((await api('a')).completed, 1);
    assert.equal((await api('a')).total, 4);
    assert.equal((await api('b')).completed, 0);
    assert.equal((await api('b')).total, 2);
    // A first arrival follows all established positions even while their tasks are away.
    await move('existing', 'b', 'a');
    assert.deepEqual(await ids('a'), ['first', 'middle', 'last', newSource.id, 'existing']);
    await server.stop();
    server = await start(databasePath);
    await move('last', 'a', 'b');
    await move('middle', 'a', 'b');
    await move('first', 'a', 'b');
    await move('existing', 'a', 'b');
    assert.deepEqual(await ids('b'), ['existing', 'first', 'middle', 'last', newDestination.id]);
    assert.deepEqual((await api('b/tasks'))[2], currentMiddle);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await ids('b'), ['existing', 'first', 'middle', 'last', newDestination.id]);
    await move('middle', 'b', 'c');
    assert.deepEqual(await api('c/tasks'), [currentMiddle]);
    await move('middle', 'c', 'a');
    assert.deepEqual(await ids('a'), ['middle', newSource.id]);
    assert.deepEqual((await api('a/tasks'))[0], currentMiddle);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('notes migrate without changing existing data and persist through edits, moves, and restarts', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'notes-'));
  const databasePath = resolve(directory, 'notes.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const api = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(server.url + '/api/projects' + path, {
        method, ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      assert.equal(response.status, status);
      return response.json();
    };
    const source = await api('', 'POST', { name: 'Source' }, 201);
    const destination = await api('', 'POST', { name: 'Destination' }, 201);
    const sourcePath = `/${source.id}`;
    const destinationPath = `/${destination.id}`;
    const task = await api(sourcePath + '/tasks', 'POST', { title: 'First' }, 201);
    const second = await api(sourcePath + '/tasks', 'POST', { title: 'Second' }, 201);
    const taskPath = sourcePath + '/tasks/' + task.id;
    Object.assign(task, await api(taskPath, 'PATCH', { completed: true }));
    Object.assign(task, await api(taskPath, 'PATCH', { priority: 'High' }));
    Object.assign(task, await api(taskPath, 'PATCH', { due_date: '2024-02-29' }));
    await api(sourcePath, 'PATCH', { default_task_priority: 'Low' });
    const summary = await api(sourcePath);
    await server.stop();
    server = undefined;
    // Reproduce the preceding schema with all existing fields and remembered positions.
    const previous = new DatabaseSync(databasePath);
    previous.exec('ALTER TABLE tasks DROP COLUMN notes');
    const positions = previous.prepare('SELECT * FROM task_project_positions ORDER BY project_id, position').all();
    previous.close();
    server = await start(databasePath);
    assert.deepEqual(await api(sourcePath + '/tasks'), [task, second]);
    assert.deepEqual(await api(sourcePath), summary);
    const upgraded = new DatabaseSync(databasePath);
    assert.deepEqual(upgraded.prepare('SELECT * FROM task_project_positions ORDER BY project_id, position').all(), positions);
    upgraded.close();
    const notes = '  First line\n\tUnicode: café 日本語 📝\n<script>alert("literal")</script> & <b>text</b>\n  ';
    task.notes = notes;
    assert.deepEqual(await api(taskPath, 'PATCH', { notes }), task);
    assert.deepEqual(await api(sourcePath + '/tasks'), [task, second]);
    assert.deepEqual(await api(sourcePath), summary);
    for (const invalid of [null, 42, {}, []]) {
      await api(taskPath, 'PATCH', { notes: invalid }, 400);
      assert.deepEqual(await api(sourcePath + '/tasks'), [task, second]);
    }
    await api(destinationPath + '/tasks/' + task.id, 'PATCH', { notes: 'Wrong owner' }, 404);
    Object.assign(task, await api(taskPath, 'PATCH', { title: 'Renamed' }));
    assert.equal(task.notes, notes);
    await api(taskPath, 'PATCH', { destination_project_id: destination.id });
    await api(sourcePath + '/tasks/' + second.id, 'PATCH', { destination_project_id: destination.id });
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await api(destinationPath + '/tasks'), [task, second]);
    await api(destinationPath, 'PATCH', { archived: true });
    await api(destinationPath + '/tasks/' + task.id, 'PATCH', { notes: 'Blocked' }, 409);
    assert.deepEqual(await api(destinationPath + '/tasks'), [task, second]);
    await api(destinationPath, 'PATCH', { archived: false });
    await api(destinationPath + '/tasks/' + second.id, 'PATCH', { destination_project_id: source.id });
    await api(destinationPath + '/tasks/' + task.id, 'PATCH', { destination_project_id: source.id });
    assert.deepEqual(await api(sourcePath + '/tasks'), [task, second]);
    for (const value of [' \t\n ', '']) {
      task.notes = value;
      assert.deepEqual(await api(taskPath, 'PATCH', { notes: value }), task);
      await server.stop();
      server = await start(databasePath);
      assert.deepEqual(await api(sourcePath + '/tasks'), [task, second]);
    }
    const created = await api(sourcePath + '/tasks', 'POST', { title: 'New task' }, 201);
    assert.equal(created.notes, '');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('deletion migrates live tasks, preserves data and positions, and survives restart and archive', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'deletion-'));
  const databasePath = resolve(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(databasePath);
    const api = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(server.url + '/api/projects' + path, {
        method, ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      assert.equal(response.status, status);
      return response.json();
    };
    const source = await api('', 'POST', { name: 'Source' }, 201);
    const destination = await api('', 'POST', { name: 'Destination' }, 201);
    const path = `/${source.id}`;
    const task = await api(path + '/tasks', 'POST', { title: 'First' }, 201);
    const second = await api(path + '/tasks', 'POST', { title: 'Second' }, 201);
    const taskPath = path + '/tasks/' + task.id;
    for (const change of [{ completed: true }, { priority: 'High' },
      { due_date: '0001-01-01' }, { notes: '  Unicode 日本語\n<b>literal</b>  ' }]) {
      Object.assign(task, await api(taskPath, 'PATCH', change));
    }
    await server.stop();
    server = undefined;
    const previous = new DatabaseSync(databasePath);
    previous.exec('ALTER TABLE tasks DROP COLUMN deleted');
    const positions = previous.prepare('SELECT * FROM task_project_positions ORDER BY position').all();
    previous.close();
    server = await start(databasePath);
    assert.deepEqual(await api(path + '/tasks'), [task, second]);
    const upgraded = new DatabaseSync(databasePath);
    assert.deepEqual(upgraded.prepare('SELECT * FROM task_project_positions ORDER BY position').all(), positions);
    upgraded.close();
    await api(taskPath, 'PATCH', { deleted: 'yes' }, 400);
    task.deleted = true;
    assert.deepEqual(await api(taskPath, 'PATCH', { deleted: true }), task);
    second.deleted = true;
    await api(path + '/tasks/' + second.id, 'PATCH', { deleted: true });
    assert.equal((await api(path)).total, 0);
    assert.equal((await api(path)).completed, 0);
    const later = await api(path + '/tasks', 'POST', { title: 'Later' }, 201);
    for (const change of [{ title: 'Blocked' }, { completed: false }, { priority: 'Low' },
      { due_date: '' }, { notes: '' }, { destination_project_id: destination.id }]) {
      await api(taskPath, 'PATCH', change, 409);
    }
    await api(path, 'PATCH', { default_task_priority: 'Low' });
    await api(path, 'PATCH', { archived: true });
    await api(taskPath, 'PATCH', { deleted: false }, 409);
    await api(path + '/tasks/' + later.id, 'PATCH', { deleted: true }, 409);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await api(path + '/tasks'), [task, second, later]);
    await api(path, 'PATCH', { archived: false });
    second.deleted = false;
    await api(path + '/tasks/' + second.id, 'PATCH', { deleted: false });
    task.deleted = false;
    assert.deepEqual(await api(taskPath, 'PATCH', { deleted: false }), task);
    assert.deepEqual(await api(path + '/tasks'), [task, second, later]);
    assert.equal((await api(path)).total, 3);
    assert.equal((await api(path)).completed, 1);
    await api(taskPath, 'PATCH', { destination_project_id: destination.id });
    await api(`/${destination.id}/tasks/${task.id}`, 'PATCH', { deleted: true });
    await server.stop();
    server = await start(databasePath);
    task.deleted = true;
    assert.deepEqual(await api(`/${destination.id}/tasks`), [task]);
    await api(`/${destination.id}/tasks/${task.id}`, 'PATCH', { deleted: false });
    await api(`/${destination.id}/tasks/${task.id}`, 'PATCH', { destination_project_id: source.id });
    task.deleted = false;
    assert.deepEqual(await api(path + '/tasks'), [task, second, later]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('portable exports include all current tasks in remembered order without changing saved data', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'export-'));
  const databasePath = resolve(directory, 'workboard.sqlite');
  let server;
  try {
    // An older database gains public defaults before exporting.
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`CREATE TABLE projects (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL
    ); INSERT INTO projects (id, name) VALUES ('legacy', 'Old  PROJECT');
    CREATE TABLE tasks (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    ); INSERT INTO tasks (id, project_id, title, completed)
      VALUES ('old', 'legacy', 'Old\t task', 1)`);
    legacy.close();
    server = await start(databasePath);
    const api = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(server.url + '/api/projects' + path, {
        method, ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      });
      assert.equal(response.status, status);
      return response.json();
    };
    const download = async id => {
      const response = await fetch(`${server.url}/api/projects/${id}/export`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
      return JSON.parse(await response.text());
    };
    const portableTask = (title, fields = {}) => ({
      title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false, ...fields,
    });
    assert.deepEqual(await download('legacy'), {
      format: 'workboard-project', version: 1,
      project: { name: 'Old  PROJECT', archived: false, defaultPriority: 'Normal',
        tasks: [portableTask('Old\t task', { completed: true })] },
    });
    const other = await api('', 'POST', { name: 'Other' }, 201);
    assert.deepEqual((await download(other.id)).project.tasks, []);
    await api(`/${other.id}/tasks`, 'POST', { title: 'Must not export with legacy' }, 201);
    const second = await api('/legacy/tasks', 'POST', { title: '  Unicode 日本語 📝  ' }, 201);
    const secondPath = '/legacy/tasks/' + second.id;
    const notes = '  line one\r\n\tUnicode café 日本語 📝\r<script>literal</script> & "text"\n  ';
    for (const change of [{ priority: 'High' }, { due_date: '0001-01-01' }, { notes }]) {
      await api(secondPath, 'PATCH', change);
    }
    // Move out and return after a later creation: the export uses reserved order.
    await api('/legacy/tasks/old', 'PATCH', { destination_project_id: other.id });
    await api('/legacy/tasks', 'POST', { title: 'Later' }, 201);
    await api(`/${other.id}/tasks/old`, 'PATCH', { destination_project_id: 'legacy' });
    await api(secondPath, 'PATCH', { deleted: true });
    await api('/legacy', 'PATCH', { default_task_priority: 'Low' });
    const expected = {
      format: 'workboard-project', version: 1,
      project: { name: 'Old  PROJECT', archived: false, defaultPriority: 'Low', tasks: [
        portableTask('Old\t task', { completed: true }),
        portableTask('Unicode 日本語 📝', { priority: 'High', dueDate: '0001-01-01',
          notes: notes.replace(/\r\n?/g, '\n'), deleted: true }),
        portableTask('Later'),
      ] },
    };
    const savedTasks = await api('/legacy/tasks');
    const savedProjects = await api('');
    const readPositions = () => {
      const db = new DatabaseSync(databasePath);
      try { return db.prepare('SELECT * FROM task_project_positions ORDER BY project_id, position').all(); }
      finally { db.close(); }
    };
    const savedPositions = readPositions();
    assert.deepEqual(await download('legacy'), expected);
    assert.deepEqual(await api('/legacy/tasks'), savedTasks);
    assert.deepEqual(await api(''), savedProjects);
    assert.deepEqual(readPositions(), savedPositions);
    await api('/legacy/tasks/old', 'PATCH', { deleted: true });
    const later = (await api('/legacy/tasks'))[2];
    await api('/legacy/tasks/' + later.id, 'PATCH', { deleted: true });
    expected.project.tasks.forEach(task => { task.deleted = true; });
    await api('/legacy', 'PATCH', { archived: true });
    expected.project.archived = true;
    assert.deepEqual(await download('legacy'), expected);
    assert.equal((await api('/legacy')).total, 0);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await download('legacy'), expected);
    assert.equal((await api('/legacy/tasks'))[1].notes, notes);
    assert.deepEqual(readPositions(), savedPositions);
    await api('/missing/export', 'GET', undefined, 404);
    await api('/legacy', 'PATCH', { archived: false });
    await api(secondPath, 'PATCH', { deleted: false });
    assert.equal((await api('/legacy/tasks'))[1].notes, notes);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('directory reads upgraded and imported tasks in owner and remembered order without mutations', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data', 'directory-'));
  const databasePath = resolve(directory, 'workboard.sqlite');
  let server;
  try {
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`CREATE TABLE projects (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL
    ); INSERT INTO projects (id, name) VALUES ('a', 'Original owner');
    CREATE TABLE tasks (
      position INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0
    ); INSERT INTO tasks (id, project_id, title) VALUES ('first', 'a', 'First'), ('second', 'a', 'Second')`);
    legacy.close();
    server = await start(databasePath);
    const api = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(server.url + path, { method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }) });
      assert.equal(response.status, status);
      return response.json();
    };
    const imported = await api('/api/projects/import', 'POST', {
      name: 'Imported owner', document: JSON.stringify(portableProject()),
    }, 201);
    const destination = await api('/api/projects', 'POST', { name: 'Destination' }, 201);
    const move = (task, source, target) => api(`/api/projects/${source}/tasks/${task}`, 'PATCH',
      { destination_project_id: target });
    await move('first', 'a', destination.id);
    const later = await api('/api/projects/a/tasks', 'POST', { title: 'Later' }, 201);
    await move('first', destination.id, 'a');
    await api('/api/projects/a/tasks/first', 'PATCH', { deleted: true });
    await api(`/api/projects/${imported.id}`, 'PATCH', { archived: true });
    const snapshot = () => {
      const db = new DatabaseSync(databasePath);
      try {
        return ['projects', 'tasks', 'task_project_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
      } finally { db.close(); }
    };
    const before = snapshot();
    const results = await api('/api/directory');
    assert.deepEqual(results.map(task => task.title), ['First', 'Second', 'Later',
      portableProject().project.tasks[0].title, 'Deleted task']);
    assert.deepEqual(results.slice(0, 3).map(task => task.id), ['first', 'second', later.id]);
    assert.equal(results[0].deleted, true);
    assert.equal(results[1].priority, 'Normal');
    assert.equal(results[1].notes, '');
    assert.equal(results[1].due_date, '');
    assert.equal(results[3].archived, true);
    assert.equal(results[3].completed, true);
    assert.equal(results[3].priority, 'Low');
    assert.equal(results[3].due_date, '2000-02-29');
    assert.equal(results[3].notes, portableProject().project.tasks[0].notes.replace(/\r\n?/g, '\n'));
    assert.equal(results[3].project_id, imported.id);
    assert.equal(results[3].project_name, 'Imported owner');
    assert.equal(results[4].deleted, true);
    for (const path of ['/directory', '/directory.js', '/filters.js']) {
      assert.equal((await fetch(server.url + path)).status, 200);
    }
    assert.deepEqual(await api('/health'), { status: 'ok' });
    assert.deepEqual(snapshot(), before);
    await server.stop();
    server = await start(databasePath);
    assert.deepEqual(await api('/api/directory'), results);
    assert.deepEqual(snapshot(), before);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
