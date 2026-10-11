import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test('projects, tasks, renames, priorities, archive state, and summaries persist across server restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        await delay(20);
      }
    }
    throw new Error(`Server did not start: ${output}`);
  }

  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = null;
  }

  async function create(name) {
    return fetch(`${base}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  async function createTask(projectId, title) {
    return fetch(`${base}/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  }

  async function setCompleted(projectId, taskId, completed) {
    return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
  }

  async function renameTask(projectId, taskId, title) {
    return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
  }

  async function setPriority(projectId, taskId, priority) {
    return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}/priority`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    });
  }

  async function setDueDate(projectId, taskId, dueDate) {
    return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}/due-date`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date: dueDate }),
    });
  }

  async function moveTask(projectId, taskId, destinationProjectId) {
    return fetch(`${base}/api/projects/${projectId}/tasks/${taskId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination_project_id: destinationProjectId }),
    });
  }

  async function listTasks(projectId) {
    const response = await fetch(`${base}/api/projects/${projectId}/tasks`);
    assert.equal(response.status, 200);
    return response.json();
  }

  async function setArchived(projectId, archived) {
    return fetch(`${base}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
  }

  async function getProject(projectId) {
    return (await fetch(`${base}/api/projects/${projectId}`)).json();
  }

  async function setDefaultPriority(projectId, priority) {
    return fetch(`${base}/api/projects/${projectId}/default-task-priority`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    });
  }

  async function rename(projectId, name) {
    return fetch(`${base}/api/projects/${projectId}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  try {
    await start();
    for (const module of ['app.js', 'task-filters.js', 'dates.js']) {
      const response = await fetch(`${base}/${module}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/javascript/);
      assert.ok((await response.text()).length > 0);
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    for (const name of ['', ' \t\n ', null, 123]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    assert.equal(first.archived, false);
    assert.equal(first.default_task_priority, 'Normal');
    assert.equal(first.total_count, 0);
    assert.equal(first.completed_count, 0);
    const second = await (await create('<script> & second')).json();
    assert.notEqual(first.id, second.id);
    const expected = [first, second];
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<script type="module" src="\/app.js">/);
    }
    assert.equal((await fetch(`${base}/app.js`)).status, 200);
    const filtersAsset = await fetch(`${base}/task-filters.js`);
    assert.equal(filtersAsset.status, 200);
    assert.match(filtersAsset.headers.get('content-type'), /text\/javascript/);
    assert.match(await filtersAsset.text(), /export function filterTasks/);
    assert.equal((await fetch(`${base}/style.css`)).status, 200);
    const malformed = await fetch(`${base}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await listTasks(first.id), []);
    for (const title of ['', ' \t\n ', null, 123]) {
      const response = await createTask(first.id, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await listTasks(first.id), []);
    const firstTaskResponse = await createTask(first.id, '  First task  ');
    assert.equal(firstTaskResponse.status, 201);
    const firstTask = await firstTaskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    assert.equal(firstTask.priority, 'Normal');
    const secondTask = await (await createTask(first.id, '<script> & second task')).json();
    assert.notEqual(firstTask.id, secondTask.id);
    assert.deepEqual(await listTasks(first.id), [firstTask, secondTask]);
    assert.deepEqual(await listTasks(second.id), []);
    const otherTask = await (await createTask(second.id, 'Other project task')).json();
    assert.equal((await setCompleted(second.id, firstTask.id, true)).status, 404);
    assert.equal((await setCompleted(first.id, 999999, true)).status, 404);
    assert.equal((await createTask(999999, 'Missing project')).status, 404);
    assert.equal((await fetch(`${base}/api/projects/999999/tasks`)).status, 404);
    for (const completed of [null, 1, 'true']) {
      assert.equal((await setCompleted(first.id, firstTask.id, completed)).status, 400);
    }
    assert.deepEqual(await listTasks(first.id), [firstTask, secondTask]);
    const completedResponse = await setCompleted(first.id, firstTask.id, true);
    assert.equal(completedResponse.status, 200);
    const completedTask = { ...firstTask, completed: true };
    assert.deepEqual(await completedResponse.json(), completedTask);
    assert.deepEqual(await listTasks(first.id), [completedTask, secondTask]);
    const firstWithTasks = { ...first, total_count: 2, completed_count: 1 };
    const secondWithTasks = { ...second, total_count: 1 };
    assert.deepEqual(await getProject(first.id), firstWithTasks);
    for (const priority of ['', 'high', 'Urgent', null, 123, {}, ['High']]) {
      const response = await setPriority(first.id, firstTask.id, priority);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task priority must be Low, Normal, or High' });
      assert.deepEqual(await listTasks(first.id), [completedTask, secondTask]);
    }
    assert.equal((await setPriority(second.id, firstTask.id, 'High')).status, 404);
    assert.equal((await setPriority(first.id, 999999, 'High')).status, 404);
    assert.equal((await setPriority(999999, firstTask.id, 'High')).status, 404);
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await setPriority(first.id, firstTask.id, priority);
      assert.equal(response.status, 200);
      firstTask.priority = priority;
      completedTask.priority = priority;
      assert.deepEqual(await response.json(), completedTask);
      assert.deepEqual(await listTasks(first.id), [completedTask, secondTask]);
      assert.deepEqual(await listTasks(second.id), [otherTask]);
      assert.deepEqual(await getProject(first.id), firstWithTasks);
    }
    secondTask.priority = 'Low';
    assert.deepEqual(await (await setPriority(first.id, secondTask.id, 'Low')).json(), secondTask);
    for (const title of ['', ' \t\n ', null, 123]) {
      const response = await renameTask(first.id, firstTask.id, title);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await listTasks(first.id), [completedTask, secondTask]);
    }
    assert.equal((await renameTask(second.id, firstTask.id, 'Wrong project')).status, 404);
    assert.equal((await renameTask(first.id, 999999, 'Missing task')).status, 404);
    assert.equal((await renameTask(999999, firstTask.id, 'Missing project')).status, 404);
    const renamedTaskResponse = await renameTask(first.id, firstTask.id, '  Renamed <task> & team  ');
    assert.equal(renamedTaskResponse.status, 200);
    firstTask.title = 'Renamed <task> & team';
    completedTask.title = firstTask.title;
    assert.deepEqual(await renamedTaskResponse.json(), completedTask);
    const renamedOpenResponse = await renameTask(first.id, secondTask.id, '  Renamed open task  ');
    assert.equal(renamedOpenResponse.status, 200);
    secondTask.title = 'Renamed open task';
    assert.deepEqual(await renamedOpenResponse.json(), secondTask);
    assert.deepEqual(await listTasks(first.id), [completedTask, secondTask]);
    assert.deepEqual(await listTasks(second.id), [otherTask]);
    assert.deepEqual(await getProject(first.id), firstWithTasks);
    for (const name of ['', ' \t\n ', null, 123]) {
      const response = await rename(first.id, name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await getProject(first.id), firstWithTasks);
    }
    assert.equal((await rename(999999, 'Missing project')).status, 404);
    const renamedResponse = await rename(first.id, '  Renamed <project> & team  ');
    assert.equal(renamedResponse.status, 200);
    firstWithTasks.name = 'Renamed <project> & team';
    assert.deepEqual(await renamedResponse.json(), firstWithTasks);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [firstWithTasks, secondWithTasks]);
    assert.deepEqual(await listTasks(first.id), [completedTask, secondTask]);
    for (const archived of [null, 1, 'true']) {
      assert.equal((await setArchived(first.id, archived)).status, 400);
    }
    assert.equal((await setArchived(999999, true)).status, 404);
    assert.deepEqual(await (await setArchived(first.id, true)).json(), { ...firstWithTasks, archived: true });
    assert.equal((await createTask(first.id, 'Blocked task')).status, 409);
    assert.equal((await setCompleted(first.id, firstTask.id, false)).status, 409);
    const archivedPriority = await setPriority(first.id, firstTask.id, 'Low');
    assert.equal(archivedPriority.status, 409);
    assert.deepEqual(await archivedPriority.json(), { error: 'Archived project cannot be changed' });
    const archivedTaskRename = await renameTask(first.id, firstTask.id, 'Blocked task rename');
    assert.equal(archivedTaskRename.status, 409);
    assert.deepEqual(await archivedTaskRename.json(), { error: 'Archived project cannot be changed' });
    const archivedRename = await rename(first.id, 'Blocked rename');
    assert.equal(archivedRename.status, 409);
    assert.deepEqual(await archivedRename.json(), { error: 'Archived project cannot be changed' });
    assert.deepEqual(await getProject(first.id), { ...firstWithTasks, archived: true });
    assert.deepEqual(await listTasks(first.id), [completedTask, secondTask]);
    await stop();
    await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [{ ...firstWithTasks, archived: true }, secondWithTasks]);
    assert.deepEqual(await getProject(first.id), { ...firstWithTasks, archived: true });
    assert.deepEqual(await listTasks(first.id), [completedTask, secondTask]);
    assert.deepEqual(await listTasks(second.id), [otherTask]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.deepEqual(await (await setArchived(first.id, false)).json(), firstWithTasks);
    firstTask.priority = 'Normal';
    completedTask.priority = 'Normal';
    const restoredPriority = await setPriority(first.id, firstTask.id, 'Normal');
    assert.equal(restoredPriority.status, 200);
    assert.deepEqual(await restoredPriority.json(), completedTask);
    const restoredTaskRename = await renameTask(first.id, firstTask.id, '  Restored task  ');
    assert.equal(restoredTaskRename.status, 200);
    firstTask.title = 'Restored task';
    completedTask.title = firstTask.title;
    assert.deepEqual(await restoredTaskRename.json(), completedTask);
    assert.deepEqual(await listTasks(first.id), [completedTask, secondTask]);
    assert.deepEqual(await getProject(first.id), firstWithTasks);
    const restoredRename = await rename(first.id, '  Restored project  ');
    assert.equal(restoredRename.status, 200);
    firstWithTasks.name = 'Restored project';
    assert.deepEqual(await restoredRename.json(), firstWithTasks);
    assert.deepEqual(await (await setCompleted(first.id, firstTask.id, false)).json(), firstTask);
    await stop();
    await start();
    assert.deepEqual(await getProject(first.id), { ...firstWithTasks, completed_count: 0 });
    assert.deepEqual(await listTasks(first.id), [firstTask, secondTask]);
    const thirdTask = await (await createTask(first.id, 'Third task')).json();
    assert.equal(thirdTask.priority, 'Normal');
    assert.ok(thirdTask.id > otherTask.id);
    assert.deepEqual(await listTasks(first.id), [firstTask, secondTask, thirdTask]);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);
    assert.equal(third.default_task_priority, 'Normal');

    const originalTasks = await listTasks(first.id);
    const originalProject = await getProject(first.id);
    for (const priority of ['', 'high', 'Urgent', null, 123, {}, ['High']]) {
      const response = await setDefaultPriority(first.id, priority);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Default task priority must be Low, Normal, or High' });
      assert.deepEqual(await getProject(first.id), originalProject);
    }
    assert.equal((await setDefaultPriority(999999, 'High')).status, 404);
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await setDefaultPriority(first.id, priority);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...originalProject, default_task_priority: priority });
      assert.deepEqual(await listTasks(first.id), originalTasks);
      assert.equal((await getProject(second.id)).default_task_priority, 'Normal');
    }
    const inherited = await (await createTask(first.id, '  Inherits High  ')).json();
    assert.equal(inherited.title, 'Inherits High');
    assert.equal(inherited.priority, 'High');
    assert.equal(inherited.completed, false);
    assert.deepEqual(await (await setCompleted(first.id, inherited.id, true)).json(), { ...inherited, completed: true });
    const inheritedRenamed = await (await renameTask(first.id, inherited.id, ' Renamed inherited ')).json();
    assert.deepEqual(inheritedRenamed, { ...inherited, title: 'Renamed inherited', completed: true });
    await setDefaultPriority(first.id, 'Low');
    assert.deepEqual(await listTasks(first.id), [...originalTasks, inheritedRenamed]);
    const lowTask = await (await createTask(first.id, 'Inherits Low')).json();
    assert.equal(lowTask.priority, 'Low');
    const independentTask = await (await createTask(second.id, 'Independent default')).json();
    assert.equal(independentTask.priority, 'Normal');
    await rename(first.id, 'Default preserved through rename');
    await setArchived(first.id, true);
    const archivedProject = await getProject(first.id);
    const savedTasks = [...originalTasks, inheritedRenamed, lowTask];
    const blockedDefault = await setDefaultPriority(first.id, 'High');
    assert.equal(blockedDefault.status, 409);
    assert.deepEqual(await blockedDefault.json(), { error: 'Archived project cannot be changed' });
    assert.deepEqual(await getProject(first.id), archivedProject);
    await stop();
    await start();
    assert.deepEqual(await getProject(first.id), archivedProject);
    assert.deepEqual(await listTasks(first.id), savedTasks);
    await setArchived(first.id, false);
    assert.equal((await getProject(first.id)).default_task_priority, 'Low');
    assert.equal((await setDefaultPriority(first.id, 'High')).status, 200);
    assert.deepEqual(await listTasks(first.id), savedTasks);
    await stop();
    await start();
    const restoredTask = await (await createTask(first.id, 'Restored default')).json();
    assert.equal(restoredTask.priority, 'High');
    assert.deepEqual(await listTasks(first.id), [...savedTasks, restoredTask]);
    assert.equal((await getProject(first.id)).completed_count, 1);
    assert.equal((await getProject(first.id)).total_count, savedTasks.length + 1);

    // Date edits affect only the addressed task and survive every other edit.
    const beforeDateTasks = await listTasks(first.id);
    const beforeDateProject = await getProject(first.id);
    assert.ok(beforeDateTasks.every((task) => task.due_date === ''));
    const dateTask = beforeDateTasks[0];
    const savedDateTask = { ...dateTask, due_date: '0004-02-29' };
    const dateResponse = await setDueDate(first.id, dateTask.id, '  0004-02-29  ');
    assert.equal(dateResponse.status, 200);
    assert.deepEqual(await dateResponse.json(), savedDateTask);
    assert.deepEqual(await listTasks(first.id), [savedDateTask, ...beforeDateTasks.slice(1)]);
    assert.deepEqual(await getProject(first.id), beforeDateProject);
    for (const invalidDate of ['2023-02-29', '1900-02-29', '2024-04-31', '0000-01-01', '10000-01-01', '2024-1-01', '2024-01-00', '2024-13-01', '2024-01-01T00:00:00Z', null, 20240101]) {
      const response = await setDueDate(first.id, dateTask.id, invalidDate);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Due date must be a valid YYYY-MM-DD date' });
      assert.deepEqual(await listTasks(first.id), [savedDateTask, ...beforeDateTasks.slice(1)]);
    }
    assert.equal((await setDueDate(second.id, dateTask.id, '2024-01-01')).status, 404);
    assert.equal((await setDueDate(first.id, 999999, '2024-01-01')).status, 404);
    assert.equal((await setDueDate(999999, dateTask.id, '2024-01-01')).status, 404);
    await renameTask(first.id, dateTask.id, 'Date preserved');
    savedDateTask.title = 'Date preserved';
    await setPriority(first.id, dateTask.id, 'High');
    savedDateTask.priority = 'High';
    await setCompleted(first.id, dateTask.id, true);
    savedDateTask.completed = true;
    await setArchived(first.id, true);
    assert.equal((await setDueDate(first.id, dateTask.id, '')).status, 409);
    await stop();
    await start();
    assert.deepEqual(await listTasks(first.id), [savedDateTask, ...beforeDateTasks.slice(1)]);
    await setArchived(first.id, false);
    const clearedDate = await setDueDate(first.id, dateTask.id, ' \t\n ');
    savedDateTask.due_date = '';
    assert.equal(clearedDate.status, 200);
    assert.deepEqual(await clearedDate.json(), savedDateTask);
    await stop();
    await start();
    assert.deepEqual(await listTasks(first.id), [savedDateTask, ...beforeDateTasks.slice(1)]);
    // Moves preserve identity and fields, append to destination order, and update both summaries.
    await setDueDate(first.id, savedDateTask.id, '2028-02-29');
    savedDateTask.due_date = '2028-02-29';
    await setDefaultPriority(second.id, 'Low');
    const sourceBeforeMove = await listTasks(first.id);
    const destinationBeforeMove = await listTasks(second.id);
    const sourceSummary = await getProject(first.id);
    const destinationSummary = await getProject(second.id);
    const moveResponse = await moveTask(first.id, savedDateTask.id, second.id);
    assert.equal(moveResponse.status, 200);
    assert.deepEqual(await moveResponse.json(), savedDateTask);
    assert.deepEqual(await listTasks(first.id), sourceBeforeMove.slice(1));
    assert.deepEqual(await listTasks(second.id), [...destinationBeforeMove, savedDateTask]);
    assert.deepEqual(await getProject(first.id), {
      ...sourceSummary, completed_count: sourceSummary.completed_count - 1, total_count: sourceSummary.total_count - 1,
    });
    assert.deepEqual(await getProject(second.id), {
      ...destinationSummary, completed_count: destinationSummary.completed_count + 1, total_count: destinationSummary.total_count + 1,
    });
    const sourceAfterMove = await listTasks(first.id);
    const destinationAfterMove = await listTasks(second.id);
    for (const invalidId of [null, '2', 0, -1, 1.5, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal((await moveTask(second.id, savedDateTask.id, invalidId)).status, 400);
    }
    assert.equal((await moveTask(second.id, savedDateTask.id, second.id)).status, 400);
    assert.equal((await moveTask(second.id, savedDateTask.id, 999999)).status, 404);
    assert.equal((await moveTask(999999, savedDateTask.id, first.id)).status, 404);
    assert.equal((await moveTask(first.id, savedDateTask.id, second.id)).status, 404);
    assert.equal((await moveTask(second.id, 999999, first.id)).status, 404);
    await setArchived(first.id, true);
    assert.equal((await moveTask(second.id, savedDateTask.id, first.id)).status, 409);
    await setArchived(first.id, false);
    await setArchived(second.id, true);
    assert.equal((await moveTask(second.id, savedDateTask.id, first.id)).status, 409);
    assert.deepEqual(await listTasks(first.id), sourceAfterMove);
    assert.deepEqual(await listTasks(second.id), destinationAfterMove);
    await stop();
    await start();
    assert.deepEqual(await listTasks(first.id), sourceAfterMove);
    assert.deepEqual(await listTasks(second.id), destinationAfterMove);
    await setArchived(second.id, false);
    const appended = await (await createTask(second.id, 'Created after move')).json();
    assert.equal(appended.priority, 'Low');
    assert.deepEqual(await listTasks(second.id), [...destinationAfterMove, appended]);
    assert.equal((await moveTask(second.id, savedDateTask.id, first.id)).status, 200);
    assert.deepEqual(await listTasks(first.id), [savedDateTask, ...sourceAfterMove]);
    // Empty dates are preserved too, and moving to an empty project is supported.
    const blankDateTask = sourceAfterMove[0];
    assert.equal(blankDateTask.due_date, '');
    assert.equal((await moveTask(first.id, blankDateTask.id, third.id)).status, 200);
    await stop();
    await start();
    assert.deepEqual(await listTasks(third.id), [blankDateTask]);
    assert.deepEqual(await listTasks(first.id), [savedDateTask, ...sourceAfterMove.slice(1)]);
    assert.deepEqual(await listTasks(second.id), [...destinationBeforeMove, appended]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
