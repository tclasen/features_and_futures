import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';

test('existing tasks migrate to Normal and empty due dates without changing their data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const databasePath = join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (id, name, archived) VALUES (7, 'Existing project', 1);
    INSERT INTO tasks (id, project_id, title, completed) VALUES (12, 7, 'Existing completed task', 1), (13, 7, 'Existing open task', 0);
  `);
  legacy.close();
  try {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      await import('./server.js');
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(process.env.DB_PATH);
      console.log(JSON.stringify(db.prepare('SELECT * FROM tasks ORDER BY id').all()));
      if (db.prepare('SELECT default_priority FROM projects WHERE id = 7').get().default_priority !== 'Normal') {
        throw new Error('Existing project default did not migrate to Normal');
      }
      db.close();
      process.kill(process.pid, 'SIGTERM');
    `], {
      env: { ...process.env, PORT: '0', DB_PATH: databasePath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let diagnostics = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { diagnostics += chunk; });
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, diagnostics);
    assert.deepEqual(JSON.parse(output), [
      { id: 12, project_id: 7, title: 'Existing completed task', completed: 1, priority: 'Normal', due_date: '', notes: '', position: 12 },
      { id: 13, project_id: 7, title: 'Existing open task', completed: 0, priority: 'Normal', due_date: '', notes: '', position: 13 },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects, tasks, archives, renames, priorities, and summaries persist with the original schema migrated', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.close();
  const portReservation = createServer();
  portReservation.listen(0, '127.0.0.1');
  await once(portReservation, 'listening');
  const port = portReservation.address().port;
  await new Promise((resolve) => portReservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let diagnostics = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', (chunk) => { diagnostics += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${diagnostics}`);
      try {
        const health = await fetch(`${base}/health`);
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { status: 'ok' });
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
  async function create(name) {
    return fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
  }
  async function createTask(projectId, title) {
    return fetch(`${base}/api/projects/${projectId}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
  }
  async function completeTask(projectId, taskId, completed) {
    return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
    });
  }
  async function renameTask(projectId, taskId, title) {
    return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
  }
  async function setPriority(projectId, taskId, priority) {
    return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority }),
    });
  }
  async function archiveProject(projectId, archived) {
    return fetch(`${base}/api/projects/${projectId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
    });
  }
  async function projects() {
    return (await fetch(`${base}/api/projects`)).json();
  }
  async function renameProject(projectId, name) {
    return fetch(`${base}/api/projects/${projectId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
  }
  async function setDefault(projectId, default_priority) {
    return fetch(`${base}/api/projects/${projectId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ default_priority }),
    });
  }
  async function tasks(projectId) {
    return (await fetch(`${base}/api/projects/${projectId}/tasks`)).json();
  }
  try {
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    for (const name of ['', '  \t\n  ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const response = await create('  First project  ');
    assert.equal(response.status, 201);
    const first = await response.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, false);
    assert.equal(first.total, 0);
    assert.equal(first.completed, 0);
    assert.equal(first.default_priority, 'Normal');
    const second = await (await create('<script>Example</script>')).json();
    assert.equal(second.default_priority, 'Normal');
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    const page = await fetch(`${base}/projects/${first.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /src="\/app.js"/);
    assert.deepEqual(await tasks(first.id), []);
    for (const title of ['', '  \t\n  ']) {
      const invalid = await createTask(first.id, title);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await tasks(first.id), []);
    const created = await createTask(first.id, '  First task  ');
    assert.equal(created.status, 201);
    const firstTask = await created.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    assert.equal(firstTask.priority, 'Normal');
    const secondTask = await (await createTask(first.id, '<b>Second task</b>')).json();
    const otherTask = await (await createTask(second.id, 'Other project task')).json();
    assert.equal(secondTask.priority, 'Normal');
    assert.equal(otherTask.priority, 'Normal');
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await completeTask(second.id, firstTask.id, true)).status, 404);
    assert.equal((await completeTask(first.id, firstTask.id, 'true')).status, 400);
    assert.equal((await createTask(99999, 'Orphan task')).status, 404);
    const completedResponse = await completeTask(first.id, firstTask.id, true);
    assert.equal(completedResponse.status, 200);
    const completedTask = await completedResponse.json();
    assert.deepEqual(completedTask, { ...firstTask, completed: true });
    assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
    Object.assign(first, { total: 2, completed: 1 });
    Object.assign(second, { total: 1, completed: 0 });
    assert.deepEqual(await projects(), expected);
    for (const priority of ['Urgent', 'high', '', null, 1]) {
      assert.equal((await setPriority(first.id, firstTask.id, priority)).status, 400);
    }
    assert.equal((await setPriority(second.id, firstTask.id, 'High')).status, 404);
    assert.equal((await setPriority(first.id, 99999, 'High')).status, 404);
    assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
    for (const priority of ['Low', 'Normal', 'High']) {
      const saved = await setPriority(first.id, firstTask.id, priority);
      assert.equal(saved.status, 200);
      firstTask.priority = priority;
      completedTask.priority = priority;
      assert.deepEqual(await saved.json(), completedTask);
      assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
      assert.deepEqual(await tasks(second.id), [otherTask]);
      assert.deepEqual(await projects(), expected);
    }
    for (const title of ['', '  \t\n  ', null]) {
      const invalid = await renameTask(first.id, firstTask.id, title);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
      assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
    }
    assert.equal((await renameTask(second.id, firstTask.id, 'Wrong owner')).status, 404);
    assert.equal((await renameTask(first.id, 99999, 'Missing')).status, 404);
    const renamedTask = await renameTask(first.id, firstTask.id, '  Renamed completed task  ');
    assert.equal(renamedTask.status, 200);
    firstTask.title = 'Renamed completed task';
    completedTask.title = firstTask.title;
    assert.deepEqual(await renamedTask.json(), completedTask);
    const renamedOpenTask = await renameTask(first.id, secondTask.id, '  Renamed open task  ');
    assert.equal(renamedOpenTask.status, 200);
    secondTask.title = 'Renamed open task';
    assert.deepEqual(await renamedOpenTask.json(), secondTask);
    assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.deepEqual(await projects(), expected);
    for (const name of ['', '  \t\n  ', null]) {
      const invalid = await renameProject(first.id, name);
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
      assert.deepEqual(await projects(), expected);
    }
    assert.equal((await renameProject(99999, 'Missing')).status, 404);
    const renamed = await renameProject(first.id, '  Renamed project  ');
    assert.equal(renamed.status, 200);
    first.name = 'Renamed project';
    assert.deepEqual(await renamed.json(), first);
    assert.deepEqual(await projects(), expected);
    assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
    assert.equal((await archiveProject(first.id, 'true')).status, 400);
    assert.equal((await archiveProject(99999, true)).status, 404);
    const archived = await archiveProject(first.id, true);
    assert.equal(archived.status, 200);
    first.archived = true;
    assert.deepEqual(await archived.json(), first);
    const blockedRename = await renameProject(first.id, 'Blocked rename');
    assert.equal(blockedRename.status, 409);
    assert.deepEqual(await blockedRename.json(), { error: 'Archived project' });
    assert.deepEqual(await projects(), expected);
    assert.equal((await createTask(first.id, 'Blocked')).status, 409);
    assert.equal((await completeTask(first.id, firstTask.id, false)).status, 409);
    assert.equal((await setPriority(first.id, firstTask.id, 'Low')).status, 409);
    const blockedTaskRename = await renameTask(first.id, firstTask.id, 'Blocked title');
    assert.equal(blockedTaskRename.status, 409);
    assert.deepEqual(await blockedTaskRename.json(), { error: 'Archived project' });
    assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
    await stop();
    await start();
    assert.deepEqual(await projects(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}`)).json(), second);
    assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
    assert.deepEqual(await tasks(second.id), [otherTask]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    const restored = await archiveProject(first.id, false);
    assert.equal(restored.status, 200);
    first.archived = false;
    assert.deepEqual(await restored.json(), first);
    assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
    const restoredRename = await renameProject(first.id, '  Restored project  ');
    assert.equal(restoredRename.status, 200);
    first.name = 'Restored project';
    assert.deepEqual(await restoredRename.json(), first);
    assert.deepEqual(await projects(), expected);
    assert.deepEqual(await tasks(first.id), [completedTask, secondTask]);
    assert.deepEqual(await (await completeTask(first.id, firstTask.id, false)).json(), firstTask);
    const restoredTaskRename = await renameTask(first.id, firstTask.id, '  Restored task  ');
    assert.equal(restoredTaskRename.status, 200);
    firstTask.title = 'Restored task';
    assert.deepEqual(await restoredTaskRename.json(), firstTask);
    const restoredPriority = await setPriority(first.id, secondTask.id, 'Low');
    assert.equal(restoredPriority.status, 200);
    secondTask.priority = 'Low';
    assert.deepEqual(await restoredPriority.json(), secondTask);
    first.completed = 0;
    await stop();
    await start();
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await projects(), expected);
    // Defaults affect only subsequent creations in their own project.
    for (const invalid of ['', 'Urgent', 'high', null, 1]) {
      assert.equal((await setDefault(first.id, invalid)).status, 400);
    }
    assert.equal((await setDefault(99999, 'Low')).status, 404);
    assert.deepEqual(await projects(), expected);
    for (const value of ['Low', 'Normal', 'High']) {
      const saved = await setDefault(first.id, value);
      assert.equal(saved.status, 200);
      first.default_priority = value;
      assert.deepEqual(await saved.json(), first);
      assert.deepEqual(await tasks(first.id), [firstTask, secondTask]);
      assert.deepEqual(await projects(), expected);
    }
    const inherited = await (await createTask(first.id, 'Inherits High')).json();
    assert.equal(inherited.priority, 'High');
    first.total++;
    assert.equal((await setDefault(first.id, 'Low')).status, 200);
    first.default_priority = 'Low';
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask, inherited]);
    const independent = await (await createTask(second.id, 'Independent default')).json();
    assert.equal(independent.priority, 'Normal');
    second.total++;
    assert.equal((await archiveProject(first.id, true)).status, 200);
    first.archived = true;
    assert.equal((await setDefault(first.id, 'Normal')).status, 409);
    await stop();
    await start();
    assert.deepEqual(await projects(), expected);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask, inherited]);
    assert.deepEqual(await tasks(second.id), [otherTask, independent]);
    assert.equal((await archiveProject(first.id, false)).status, 200);
    first.archived = false;
    const renamedDefaultProject = await renameProject(first.id, '  Default \t  RETAINED  ');
    first.name = 'Default \t  RETAINED';
    assert.deepEqual(await renamedDefaultProject.json(), first);
    const afterRestore = await (await createTask(first.id, 'Inherits restored Low')).json();
    assert.equal(afterRestore.priority, 'Low');
    first.total++;
    assert.equal((await setDefault(first.id, 'High')).status, 200);
    first.default_priority = 'High';
    await stop();
    await start();
    assert.deepEqual(await projects(), expected);
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask, inherited, afterRestore]);
    // Due dates validate calendar days and change only the addressed task.
    const saveDate = (projectId, taskId, due_date) => fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ due_date }),
    });
    assert.equal(firstTask.due_date, '');
    assert.equal(afterRestore.due_date, '');
    for (const date of ['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29', '1900-02-28', '  2026-10-12 \n']) {
      const saved = await saveDate(first.id, firstTask.id, date);
      assert.equal(saved.status, 200);
      firstTask.due_date = date.trim();
      assert.deepEqual(await saved.json(), firstTask);
    }
    for (const invalid of ['0000-01-01', '10000-01-01', '1900-02-29', '2100-02-29', '2025-02-29', '2024-02-30', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-1-01', '26-01-01', '2026-01-01T00:00:00Z', 'invalid', null, 1]) {
      const response = await saveDate(first.id, firstTask.id, invalid);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Due date must be a valid YYYY-MM-DD date' });
      assert.deepEqual(await tasks(first.id), [firstTask, secondTask, inherited, afterRestore]);
    }
    assert.equal((await saveDate(second.id, firstTask.id, '2026-12-01')).status, 404);
    assert.equal((await saveDate(first.id, 99999, '2026-12-01')).status, 404);
    assert.equal((await saveDate(first.id, secondTask.id, '2027-01-02')).status, 200);
    secondTask.due_date = '2027-01-02';
    const renamedDatedTask = await renameTask(first.id, firstTask.id, '  Dated \t  TASK  ');
    firstTask.title = 'Dated \t  TASK';
    assert.deepEqual(await renamedDatedTask.json(), firstTask);
    assert.deepEqual(await projects(), expected);
    assert.deepEqual(await tasks(second.id), [otherTask, independent]);
    assert.equal((await archiveProject(first.id, true)).status, 200);
    first.archived = true;
    assert.equal((await saveDate(first.id, firstTask.id, '')).status, 409);
    await stop();
    await start();
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask, inherited, afterRestore]);
    assert.deepEqual(await projects(), expected);
    assert.equal((await archiveProject(first.id, false)).status, 200);
    first.archived = false;
    for (const empty of ['', '  \t\n']) {
      const saved = await saveDate(first.id, firstTask.id, empty);
      firstTask.due_date = '';
      assert.equal(saved.status, 200);
      assert.deepEqual(await saved.json(), firstTask);
    }
    await stop();
    await start();
    assert.deepEqual(await tasks(first.id), [firstTask, secondTask, inherited, afterRestore]);
    assert.deepEqual(await projects(), expected);
    assert.equal((await fetch(`${base}/api/projects/99999`)).status, 404);
    const move = (source, task, destination_project_id) => fetch(`${base}/api/projects/${source}/tasks/${task}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destination_project_id }),
    });
    for (const invalid of [first.id, 0, null, String(second.id)]) {
      assert.equal((await move(first.id, secondTask.id, invalid)).status, 400);
    }
    assert.equal((await move(first.id, secondTask.id, 99999)).status, 404);
    assert.equal((await move(second.id, secondTask.id, first.id)).status, 404);
    await archiveProject(second.id, true);
    assert.equal((await move(first.id, secondTask.id, second.id)).status, 409);
    await archiveProject(second.id, false);
    await archiveProject(first.id, true);
    assert.equal((await move(first.id, secondTask.id, second.id)).status, 409);
    await archiveProject(first.id, false);
    // Move an older, completed, dated task after newer destination tasks.
    secondTask.completed = true;
    await completeTask(first.id, secondTask.id, true);
    const moved = await move(first.id, secondTask.id, second.id);
    assert.equal(moved.status, 200);
    assert.deepEqual(await moved.json(), secondTask);
    assert.deepEqual(await tasks(first.id), [firstTask, inherited, afterRestore]);
    assert.deepEqual(await tasks(second.id), [otherTask, independent, secondTask]);
    first.total--;
    second.total++;
    second.completed++;
    assert.deepEqual(await projects(), expected);
    await stop();
    await start();
    assert.deepEqual(await tasks(second.id), [otherTask, independent, secondTask]);
    assert.deepEqual(await projects(), expected);
    // First arrival appends; returning tasks recover their remembered position.
    assert.equal((await move(first.id, firstTask.id, second.id)).status, 200);
    assert.deepEqual(await tasks(second.id), [otherTask, independent, secondTask, firstTask]);
    assert.equal((await move(second.id, secondTask.id, first.id)).status, 200);
    const newTask = await (await createTask(first.id, 'Created after move')).json();
    assert.deepEqual(await tasks(first.id), [secondTask, inherited, afterRestore, newTask]);
    await stop();
    await start();
    assert.deepEqual(await tasks(first.id), [secondTask, inherited, afterRestore, newTask]);
    assert.deepEqual(await tasks(second.id), [otherTask, independent, firstTask]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
