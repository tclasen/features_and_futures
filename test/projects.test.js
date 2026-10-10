import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { matchesProjectFilters } from '../public/search.js';
import { matchesTaskFilters } from '../public/task-filters.js';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error(errors)); });
    child.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('normalized searches preserve original names, titles, and task data across restart and archival', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const send = async (path, method, body) => {
      const response = await fetch(`${server.url}${path}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      assert.ok(response.ok);
      return response.json();
    };
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    const project = await send('/api/projects', 'POST', { name: '  MiXeD \t  Project  ' });
    const projectPath = `/api/projects/${project.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const task = await send(tasksPath, 'POST', { title: '  MiXeD\t \t Task  ' });
    const taskPath = `${tasksPath}/${task.id}`;
    await send(taskPath, 'PATCH', { completed: true });
    await send(taskPath, 'PATCH', { priority: 'High' });
    const savedTask = await send(taskPath, 'PATCH', { dueDate: '2026-10-10' });
    assert.equal(project.name, 'MiXeD \t  Project');
    assert.equal(savedTask.title, 'MiXeD\t \t Task');
    const range = { from: '2026-10-10', through: '2026-10-10' };
    for (const archived of [false, true, false]) {
      const savedProject = await send(projectPath, 'PATCH', { archived });
      await server.stop();
      server = undefined;
      server = await start(dbPath);
      const projects = await list('/api/projects');
      const tasks = await list(tasksPath);
      assert.deepEqual(projects, [savedProject]);
      assert.deepEqual(tasks, [savedTask]);
      assert.deepEqual(projects.filter((entry) => matchesProjectFilters(
        entry, archived ? 'Archived' : 'Active', ' mixed\t project ',
      )), [savedProject]);
      assert.deepEqual(tasks.filter((entry) => matchesTaskFilters(
        entry, 'Completed', 'High', range, ' mixed  task ',
      )), [savedTask]);
      assert.deepEqual(tasks.filter((entry) => matchesTaskFilters(entry, 'All', 'All')), [savedTask]);
      // Matching must not mutate the fetched objects used for display.
      assert.deepEqual(projects, [savedProject]);
      assert.deepEqual(tasks, [savedTask]);
    }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('due dates preserve other task data and persist through rename, archive, clearing, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-due-date-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    const first = await (await send('/api/projects', 'POST', { name: 'First' })).json();
    const second = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const task = await (await send(tasksPath, 'POST', { title: 'Original' })).json();
    const next = await (await send(tasksPath, 'POST', { title: 'Next' })).json();
    const other = await (await send(otherTasksPath, 'POST', { title: 'Other' })).json();
    for (const created of [task, next, other]) assert.equal(created.dueDate, '');
    const taskPath = `${tasksPath}/${task.id}`;
    await send(taskPath, 'PATCH', { completed: true });
    const completed = await (await send(taskPath, 'PATCH', { priority: 'High' })).json();
    const summaries = await list('/api/projects');
    let expected = { ...completed, dueDate: '2000-02-29' };
    const saved = await send(taskPath, 'PATCH', { dueDate: ' \t2000-02-29\n ' });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), expected);
    for (const dueDate of ['1900-02-29', '2026-04-31', '0000-01-01', '2026-1-01', 'nonsense', null, 42]) {
      const response = await send(taskPath, 'PATCH', { dueDate });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Due date must be a valid YYYY-MM-DD date' });
      assert.deepEqual(await list(tasksPath), [expected, next]);
    }
    assert.equal((await send(`${otherTasksPath}/${task.id}`, 'PATCH', { dueDate: '2026-01-01' })).status, 404);
    assert.equal((await send(taskPath, 'PATCH', { dueDate: '', title: 'Changed' })).status, 400);
    expected = { ...expected, title: 'Renamed' };
    assert.deepEqual(await (await send(taskPath, 'PATCH', { title: ' Renamed ' })).json(), expected);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [expected, next]);
    assert.deepEqual(await list(otherTasksPath), [other]);
    assert.deepEqual(await list('/api/projects'), summaries);
    await send(projectPath, 'PATCH', { archived: true });
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    for (const dueDate of ['', '2026-01-01']) {
      assert.equal((await send(taskPath, 'PATCH', { dueDate })).status, 409);
    }
    assert.deepEqual(await list(tasksPath), [expected, next]);
    await send(projectPath, 'PATCH', { archived: false });
    for (const dueDate of ['', ' \t\n ']) {
      await send(taskPath, 'PATCH', { dueDate: '9999-12-31' });
      expected = { ...expected, dueDate: '' };
      assert.deepEqual(await (await send(taskPath, 'PATCH', { dueDate })).json(), expected);
    }
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [expected, next]);
    assert.deepEqual(await list(otherTasksPath), [other]);
    assert.deepEqual(await list('/api/projects'), summaries);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects and owned tasks validate, preserve order, and survive a server-process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = (name) => fetch(`${server.url}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    for (const name of ['', '  \t\n', null, 42]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<Second project>')).json();
    assert.notEqual(first.id, second.id);
    let expected = [first, second];
    assert.deepEqual(first, { id: first.id, name: 'First project', archived: false, defaultTaskPriority: 'Normal', totalCount: 0, completedCount: 0 });
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(`${server.url}${path}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<title>Workboard<\/title>/);
    }
    assert.equal((await fetch(`${server.url}/api/projects/999999`)).status, 404);
    const malformed = await fetch(`${server.url}/api/projects`, { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    const tasksPath = `/api/projects/${first.id}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    for (const title of ['', '  \t\n', null, 42]) {
      const response = await send(tasksPath, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await list(tasksPath), []);
    const taskResponse = await send(tasksPath, 'POST', { title: '  First task  ' });
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const nextTask = await (await send(tasksPath, 'POST', { title: '<Next task>' })).json();
    const otherTask = await (await send(otherTasksPath, 'POST', { title: 'Other project task' })).json();
    assert.deepEqual(await list(tasksPath), [task, nextTask]);
    assert.deepEqual(await list(otherTasksPath), [otherTask]);
    assert.equal((await send(`${otherTasksPath}/${task.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await send('/api/projects/999999/tasks', 'POST', { title: 'Missing project' })).status, 404);
    for (const completed of ['true', 1, null]) {
      assert.equal((await send(`${tasksPath}/${task.id}`, 'PATCH', { completed })).status, 400);
    }
    assert.deepEqual(await list(tasksPath), [task, nextTask]);
    const completedResponse = await send(`${tasksPath}/${task.id}`, 'PATCH', { completed: true });
    assert.equal(completedResponse.status, 200);
    const completedTask = { ...task, completed: true };
    assert.deepEqual(await completedResponse.json(), completedTask);
    assert.deepEqual(await list(tasksPath), [completedTask, nextTask]);
    const firstWithTasks = { ...first, totalCount: 2, completedCount: 1 };
    expected = [firstWithTasks, { ...second, totalCount: 1 }];
    assert.deepEqual(await list('/api/projects'), expected);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), expected);
    assert.deepEqual(await (await fetch(`${server.url}/api/projects/${first.id}`)).json(), firstWithTasks);
    assert.deepEqual(await list(tasksPath), [completedTask, nextTask]);
    assert.deepEqual(await list(otherTasksPath), [otherTask]);
    const projectPath = `/api/projects/${first.id}`;
    for (const archived of [null, 1, 'true']) {
      assert.equal((await send(projectPath, 'PATCH', { archived })).status, 400);
    }
    assert.equal((await send('/api/projects/999999', 'PATCH', { archived: true })).status, 404);
    const archivedProject = { ...firstWithTasks, archived: true };
    const archivedResponse = await send(projectPath, 'PATCH', { archived: true });
    assert.equal(archivedResponse.status, 200);
    assert.deepEqual(await archivedResponse.json(), archivedProject);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(projectPath), archivedProject);
    assert.deepEqual(await list('/api/projects'), [archivedProject, expected[1]]);
    assert.deepEqual(await list(tasksPath), [completedTask, nextTask]);
    assert.equal((await send(tasksPath, 'POST', { title: 'Blocked' })).status, 409);
    assert.equal((await send(`${tasksPath}/${task.id}`, 'PATCH', { completed: false })).status, 409);
    assert.deepEqual(await list(tasksPath), [completedTask, nextTask]);
    assert.deepEqual(await list(projectPath), archivedProject);
    assert.deepEqual(await (await send(projectPath, 'PATCH', { archived: false })).json(), firstWithTasks);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(projectPath), firstWithTasks);
    assert.deepEqual(await list(tasksPath), [completedTask, nextTask]);
    const reopened = await send(`${tasksPath}/${task.id}`, 'PATCH', { completed: false });
    assert.equal(reopened.status, 200);
    assert.deepEqual(await reopened.json(), task);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [task, nextTask]);
    assert.deepEqual(await list(projectPath), { ...firstWithTasks, completedCount: 0 });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('renaming preserves project identity, order, tasks, summaries, and archived protection across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-rename-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    const first = await (await send('/api/projects', 'POST', { name: 'Original' })).json();
    const second = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const task = await (await send(tasksPath, 'POST', { title: 'Saved task' })).json();
    const completedTask = await (await send(`${tasksPath}/${task.id}`, 'PATCH', { completed: true })).json();
    const openTask = await (await send(tasksPath, 'POST', { title: 'Open task' })).json();
    const original = { ...first, totalCount: 2, completedCount: 1 };
    for (const name of ['', ' \t\n ', null, 42]) {
      const response = await send(projectPath, 'PATCH', { name });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
      assert.deepEqual(await list(projectPath), original);
    }
    assert.equal((await send('/api/projects/999999', 'PATCH', { name: 'Missing' })).status, 404);
    const renamed = { ...original, name: 'Renamed project' };
    const response = await send(projectPath, 'PATCH', { name: '  Renamed project \t\n' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(projectPath), renamed);
    assert.deepEqual(await list('/api/projects'), [renamed, second]);
    assert.deepEqual(await list(tasksPath), [completedTask, openTask]);
    assert.equal((await fetch(`${server.url}/projects/${first.id}`)).status, 200);
    const archived = { ...renamed, archived: true };
    assert.deepEqual(await (await send(projectPath, 'PATCH', { archived: true })).json(), archived);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.equal((await send(projectPath, 'PATCH', { name: 'Blocked' })).status, 409);
    assert.equal((await send(projectPath, 'PATCH', { name: 'Blocked', archived: false })).status, 400);
    assert.deepEqual(await list(projectPath), archived);
    assert.deepEqual(await list(tasksPath), [completedTask, openTask]);
    assert.deepEqual(await (await send(projectPath, 'PATCH', { archived: false })).json(), renamed);
    const restored = { ...renamed, name: '<Restored project>' };
    assert.deepEqual(await (await send(projectPath, 'PATCH', { name: ' <Restored project> ' })).json(), restored);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list('/api/projects'), [restored, second]);
    assert.deepEqual(await list(tasksPath), [completedTask, openTask]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion, and summaries through archive and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-task-rename-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    const first = await (await send('/api/projects', 'POST', { name: 'First' })).json();
    const second = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const task = await (await send(tasksPath, 'POST', { title: 'Original' })).json();
    const taskPath = `${tasksPath}/${task.id}`;
    const completed = await (await send(taskPath, 'PATCH', { completed: true })).json();
    const open = await (await send(tasksPath, 'POST', { title: 'Open' })).json();
    const other = await (await send(otherTasksPath, 'POST', { title: 'Other' })).json();
    const projects = [
      { ...first, totalCount: 2, completedCount: 1 },
      { ...second, totalCount: 1 },
    ];
    for (const title of ['', ' \t\n ', null, 42]) {
      const response = await send(taskPath, 'PATCH', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
      assert.deepEqual(await list(tasksPath), [completed, open]);
    }
    assert.equal((await send(`${otherTasksPath}/${task.id}`, 'PATCH', { title: 'Wrong owner' })).status, 404);
    assert.equal((await send(`${tasksPath}/999999`, 'PATCH', { title: 'Missing' })).status, 404);
    assert.equal((await send(taskPath, 'PATCH', { title: 'Ambiguous', completed: false })).status, 400);
    const renamed = { ...completed, title: '<Renamed task>' };
    const response = await send(taskPath, 'PATCH', { title: ' \t<Renamed task>\n ' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), renamed);
    assert.deepEqual(await list(tasksPath), [renamed, open]);
    assert.deepEqual(await list(otherTasksPath), [other]);
    assert.deepEqual(await list('/api/projects'), projects);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [renamed, open]);
    assert.deepEqual(await list('/api/projects'), projects);
    await send(projectPath, 'PATCH', { archived: true });
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    const blocked = await send(taskPath, 'PATCH', { title: 'Blocked' });
    assert.equal(blocked.status, 409);
    assert.deepEqual(await blocked.json(), { error: 'Archived project is read-only' });
    assert.deepEqual(await list(tasksPath), [renamed, open]);
    assert.deepEqual(await list(projectPath), { ...projects[0], archived: true });
    await send(projectPath, 'PATCH', { archived: false });
    const restored = { ...renamed, title: 'Restored task' };
    assert.deepEqual(await (await send(taskPath, 'PATCH', { title: ' Restored task ' })).json(), restored);
    const renamedOpen = { ...open, title: 'Renamed open task' };
    assert.deepEqual(await (await send(`${tasksPath}/${open.id}`, 'PATCH', { title: ' Renamed open task ' })).json(), renamedOpen);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [restored, renamedOpen]);
    assert.deepEqual(await list(otherTasksPath), [other]);
    assert.deepEqual(await list('/api/projects'), projects);
    const reopened = { ...restored, completed: false };
    assert.deepEqual(await (await send(taskPath, 'PATCH', { completed: false })).json(), reopened);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('priorities persist independently and preserve task data through rename, archive, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-priority-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    const first = await (await send('/api/projects', 'POST', { name: 'First' })).json();
    const second = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const otherTasksPath = `/api/projects/${second.id}/tasks`;
    const task = await (await send(tasksPath, 'POST', { title: 'Original' })).json();
    const next = await (await send(tasksPath, 'POST', { title: 'Next' })).json();
    const other = await (await send(otherTasksPath, 'POST', { title: 'Other' })).json();
    for (const created of [task, next, other]) assert.equal(created.priority, 'Normal');
    const taskPath = `${tasksPath}/${task.id}`;
    const completed = await (await send(taskPath, 'PATCH', { completed: true })).json();
    const projects = [
      { ...first, totalCount: 2, completedCount: 1 },
      { ...second, totalCount: 1 },
    ];
    for (const priority of ['', 'high', ' High ', null, 1, true, {}, []]) {
      const response = await send(taskPath, 'PATCH', { priority });
      assert.equal(response.status, 400);
      assert.deepEqual(await list(tasksPath), [completed, next]);
    }
    for (const body of [{ priority: 'High', title: 'Changed' }, { priority: 'High', completed: false }]) {
      assert.equal((await send(taskPath, 'PATCH', body)).status, 400);
      assert.deepEqual(await list(tasksPath), [completed, next]);
    }
    assert.equal((await send(`${otherTasksPath}/${task.id}`, 'PATCH', { priority: 'High' })).status, 404);
    assert.equal((await send(`${tasksPath}/999999`, 'PATCH', { priority: 'High' })).status, 404);
    for (const priority of ['Low', 'Normal', 'High']) {
      const response = await send(taskPath, 'PATCH', { priority });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...completed, priority });
      assert.deepEqual(await list(tasksPath), [{ ...completed, priority }, next]);
      assert.deepEqual(await list(otherTasksPath), [other]);
      assert.deepEqual(await list('/api/projects'), projects);
    }
    const renamed = { ...completed, title: 'Renamed', priority: 'High' };
    assert.deepEqual(await (await send(taskPath, 'PATCH', { title: ' Renamed ' })).json(), renamed);
    const lowNext = { ...next, priority: 'Low' };
    assert.deepEqual(await (await send(`${tasksPath}/${next.id}`, 'PATCH', { priority: 'Low' })).json(), lowNext);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [renamed, lowNext]);
    assert.deepEqual(await list(otherTasksPath), [other]);
    assert.deepEqual(await list('/api/projects'), projects);
    await send(projectPath, 'PATCH', { archived: true });
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    const blocked = await send(taskPath, 'PATCH', { priority: 'Low' });
    assert.equal(blocked.status, 409);
    assert.deepEqual(await blocked.json(), { error: 'Archived project is read-only' });
    assert.deepEqual(await list(tasksPath), [renamed, lowNext]);
    await send(projectPath, 'PATCH', { archived: false });
    const restored = { ...renamed, priority: 'Normal' };
    assert.deepEqual(await (await send(taskPath, 'PATCH', { priority: 'Normal' })).json(), restored);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), [restored, lowNext]);
    assert.deepEqual(await list(otherTasksPath), [other]);
    assert.deepEqual(await list('/api/projects'), projects);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('migrates existing projects and tasks without changing IDs or completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const dbPath = join(directory, 'legacy.sqlite');
  let server;
  try {
    const database = new DatabaseSync(dbPath);
    database.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (id, name) VALUES (7, 'Existing project');
      INSERT INTO tasks (id, project_id, title, completed) VALUES (11, 7, 'Existing task', 1);`);
    database.close();
    for (let restart = 0; restart < 2; restart++) {
      server = await start(dbPath);
      assert.deepEqual(await (await fetch(`${server.url}/api/projects`)).json(), [
        { id: 7, name: 'Existing project', archived: false, defaultTaskPriority: 'Normal', totalCount: 1, completedCount: 1 },
      ]);
      assert.deepEqual(await (await fetch(`${server.url}/api/projects/7/tasks`)).json(), [
        { id: 11, title: 'Existing task', completed: true, priority: 'Normal', dueDate: '' },
      ]);
      await server.stop();
      server = undefined;
    }
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project defaults affect only future owned tasks and survive rename, archive, restoration, and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-default-priority-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    const first = await (await send('/api/projects', 'POST', { name: 'First' })).json();
    const second = await (await send('/api/projects', 'POST', { name: 'Second' })).json();
    assert.equal(first.defaultTaskPriority, 'Normal');
    assert.equal(second.defaultTaskPriority, 'Normal');
    const projectPath = `/api/projects/${first.id}`;
    const tasksPath = `${projectPath}/tasks`;
    const otherProjectPath = `/api/projects/${second.id}`;
    const otherTasksPath = `${otherProjectPath}/tasks`;
    const original = await (await send(tasksPath, 'POST', { title: 'Original' })).json();
    const completed = await (await send(`${tasksPath}/${original.id}`, 'PATCH', { completed: true })).json();
    const summary = { ...first, totalCount: 1, completedCount: 1 };
    for (const defaultTaskPriority of ['', 'high', ' High ', null, 1, true, {}, []]) {
      assert.equal((await send(projectPath, 'PATCH', { defaultTaskPriority })).status, 400);
      assert.deepEqual(await list(projectPath), summary);
    }
    for (const body of [
      { defaultTaskPriority: 'High', name: 'Changed' },
      { defaultTaskPriority: 'High', archived: true },
    ]) {
      assert.equal((await send(projectPath, 'PATCH', body)).status, 400);
      assert.deepEqual(await list(projectPath), summary);
    }
    assert.equal((await send('/api/projects/999999', 'PATCH', { defaultTaskPriority: 'High' })).status, 404);
    const expectedTasks = [completed];
    for (const defaultTaskPriority of ['Low', 'Normal', 'High']) {
      const response = await send(projectPath, 'PATCH', { defaultTaskPriority });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ...summary, totalCount: expectedTasks.length, defaultTaskPriority,
      });
      assert.deepEqual(await list(tasksPath), expectedTasks);
      assert.deepEqual(await list(otherProjectPath), second);
      const inherited = await (await send(tasksPath, 'POST', { title: `${defaultTaskPriority} task` })).json();
      assert.equal(inherited.priority, defaultTaskPriority);
      assert.equal(inherited.completed, false);
      expectedTasks.push(inherited);
    }
    await send(otherProjectPath, 'PATCH', { defaultTaskPriority: 'Low' });
    const otherTask = await (await send(otherTasksPath, 'POST', { title: 'Other' })).json();
    assert.equal(otherTask.priority, 'Low');
    const renamed = {
      ...summary, name: 'Renamed', totalCount: expectedTasks.length, defaultTaskPriority: 'High',
    };
    assert.deepEqual(await (await send(projectPath, 'PATCH', { name: ' Renamed ' })).json(), renamed);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(projectPath), renamed);
    assert.deepEqual(await list(tasksPath), expectedTasks);
    await send(projectPath, 'PATCH', { archived: true });
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(projectPath), { ...renamed, archived: true });
    assert.equal((await send(projectPath, 'PATCH', { defaultTaskPriority: 'Low' })).status, 409);
    assert.deepEqual(await list(tasksPath), expectedTasks);
    assert.deepEqual(await (await send(projectPath, 'PATCH', { archived: false })).json(), renamed);
    const restoredTask = await (await send(tasksPath, 'POST', { title: 'After restoration' })).json();
    assert.equal(restoredTask.priority, 'High');
    expectedTasks.push(restoredTask);
    await send(projectPath, 'PATCH', { defaultTaskPriority: 'Normal' });
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(tasksPath), expectedTasks);
    assert.deepEqual(await list(otherTasksPath), [otherTask]);
    assert.deepEqual(await list(projectPath), {
      ...renamed, defaultTaskPriority: 'Normal', totalCount: expectedTasks.length,
    });
    assert.equal((await list(otherProjectPath)).defaultTaskPriority, 'Low');
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('moves append first arrivals, restore returning tasks, preserve saved data and summaries, and persist', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-move-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const send = (path, method, body) => fetch(`${server.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    const source = await (await send('/api/projects', 'POST', { name: 'Source' })).json();
    const destination = await (await send('/api/projects', 'POST', { name: 'Destination' })).json();
    const archived = await (await send('/api/projects', 'POST', { name: 'Archived' })).json();
    const sourcePath = `/api/projects/${source.id}`;
    const destinationPath = `/api/projects/${destination.id}`;
    const archivedPath = `/api/projects/${archived.id}`;
    const sourceTasks = `${sourcePath}/tasks`;
    const destinationTasks = `${destinationPath}/tasks`;
    const first = await (await send(sourceTasks, 'POST', { title: 'Oldest task' })).json();
    const remaining = await (await send(sourceTasks, 'POST', { title: 'Remaining' })).json();
    const existing = await (await send(destinationTasks, 'POST', { title: 'Existing destination task' })).json();
    const taskPath = `${sourceTasks}/${first.id}`;
    await send(taskPath, 'PATCH', { completed: true });
    await send(taskPath, 'PATCH', { priority: 'High' });
    const moved = await (await send(taskPath, 'PATCH', { dueDate: '0001-01-01' })).json();
    await send(destinationPath, 'PATCH', { defaultTaskPriority: 'Low' });
    await send(archivedPath, 'PATCH', { archived: true });
    for (const destinationProjectId of [null, '2', 0, -1, 1.5, source.id]) {
      assert.equal((await send(`${taskPath}/move`, 'POST', { destinationProjectId })).status, 400);
    }
    assert.equal((await send(`${taskPath}/move`, 'POST', { destinationProjectId: 999999 })).status, 404);
    assert.equal((await send(`${destinationTasks}/${first.id}/move`, 'POST', { destinationProjectId: source.id })).status, 404);
    assert.equal((await send(`${sourceTasks}/999999/move`, 'POST', { destinationProjectId: destination.id })).status, 404);
    assert.equal((await send(`${taskPath}/move`, 'POST', { destinationProjectId: archived.id })).status, 409);
    await send(sourcePath, 'PATCH', { archived: true });
    assert.equal((await send(`${taskPath}/move`, 'POST', { destinationProjectId: destination.id })).status, 409);
    assert.deepEqual(await list(sourceTasks), [moved, remaining]);
    assert.deepEqual(await list(destinationTasks), [existing]);
    await send(sourcePath, 'PATCH', { archived: false });
    const response = await send(`${taskPath}/move`, 'POST', { destinationProjectId: destination.id });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), moved);
    assert.deepEqual(await list(sourceTasks), [remaining]);
    assert.deepEqual(await list(destinationTasks), [existing, moved]);
    assert.deepEqual(await list(sourcePath), { ...source, totalCount: 1 });
    assert.deepEqual(await list(destinationPath), {
      ...destination, defaultTaskPriority: 'Low', totalCount: 2, completedCount: 1,
    });
    assert.equal((await send(taskPath, 'PATCH', { title: 'Wrong owner' })).status, 404);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(sourceTasks), [remaining]);
    assert.deepEqual(await list(destinationTasks), [existing, moved]);
    const appended = await (await send(destinationTasks, 'POST', { title: 'Created after move' })).json();
    assert.equal(appended.priority, 'Low');
    assert.deepEqual(await list(destinationTasks), [existing, moved, appended]);
    const returned = await send(`${destinationTasks}/${moved.id}/move`, 'POST', { destinationProjectId: source.id });
    assert.deepEqual(await returned.json(), moved);
    assert.deepEqual(await list(sourceTasks), [moved, remaining]);
    // Blank due dates and open completion survive moves as well.
    assert.deepEqual(await (await send(`${destinationTasks}/${existing.id}/move`, 'POST', {
      destinationProjectId: source.id,
    })).json(), existing);
    assert.deepEqual(await list(sourceTasks), [moved, remaining, existing]);
    assert.deepEqual(await list(destinationTasks), [appended]);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    assert.deepEqual(await list(sourceTasks), [moved, remaining, existing]);
    assert.deepEqual(await list(destinationTasks), [appended]);
    assert.deepEqual(await list(sourcePath), { ...source, totalCount: 3, completedCount: 1 });
    assert.deepEqual(await list(destinationPath), { ...destination, defaultTaskPriority: 'Low', totalCount: 1 });
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('migration and reversed returns preserve reserved positions and current fields across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-return-order-'));
  const dbPath = join(directory, 'projects.sqlite');
  let server;
  try {
    // Task 011 order can differ from IDs after moves; migrate that actual order.
    const database = new DatabaseSync(dbPath);
    database.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (id, name) VALUES (7, 'Source'), (8, 'Destination'), (9, 'Third');
      INSERT INTO tasks (id, project_id, title, position) VALUES
        (11, 7, 'Last', 30), (12, 7, 'First', 10), (13, 7, 'Middle', 20),
        (14, 8, 'Destination original', 1);`);
    database.close();
    server = await start(dbPath);
    const projectPath = (id) => `/api/projects/${id}`;
    const tasksPath = (id) => `${projectPath(id)}/tasks`;
    async function send(path, method, body) {
      const response = await fetch(`${server.url}${path}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      assert.ok(response.ok, `${method} ${path}: ${response.status}`);
      return response.json();
    }
    const list = async (path) => (await fetch(`${server.url}${path}`)).json();
    const order = async (project, ids) => {
      assert.deepEqual((await list(tasksPath(project))).map((task) => task.id), ids);
    };
    const move = (task, source, destination) => send(`${tasksPath(source)}/${task}/move`, 'POST', {
      destinationProjectId: destination,
    });
    await order(7, [12, 13, 11]);
    await move(12, 7, 8);
    await move(13, 7, 8);
    await move(11, 7, 8);
    await order(7, []);
    await order(8, [14, 12, 13, 11]);
    // New tasks and first arrivals follow even the positions of absent tasks.
    const created = await send(tasksPath(7), 'POST', { title: 'Created while all originals away' });
    await move(14, 8, 7);
    await order(7, [created.id, 14]);
    await send(projectPath(7), 'PATCH', { name: 'Renamed source' });
    await send(projectPath(7), 'PATCH', { archived: true });
    const rejected = await fetch(`${server.url}${tasksPath(8)}/13/move`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinationProjectId: 7 }),
    });
    assert.equal(rejected.status, 409);
    await send(`${tasksPath(8)}/13`, 'PATCH', { title: ' Current middle ' });
    await send(`${tasksPath(8)}/13`, 'PATCH', { completed: true });
    await send(`${tasksPath(8)}/13`, 'PATCH', { priority: 'High' });
    const currentMiddle = await send(`${tasksPath(8)}/13`, 'PATCH', { dueDate: '2024-02-29' });
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    await order(8, [12, 13, 11]);
    await send(projectPath(7), 'PATCH', { archived: false });
    await send(projectPath(7), 'PATCH', { defaultTaskPriority: 'Low' });
    // Return in reverse order, including a visit to a third project.
    await move(11, 8, 7);
    await move(13, 8, 9);
    assert.deepEqual(await move(13, 9, 7), currentMiddle);
    await move(12, 8, 7);
    await order(7, [12, 13, 11, created.id, 14]);
    await order(8, []);
    await order(9, []);
    const summary = await list(projectPath(7));
    assert.equal(summary.name, 'Renamed source');
    assert.equal(summary.totalCount, 5);
    assert.equal(summary.completedCount, 1);
    for (const id of [8, 9]) assert.equal((await list(projectPath(id))).totalCount, 0);
    await server.stop();
    server = undefined;
    server = await start(dbPath);
    await order(7, [12, 13, 11, created.id, 14]);
    assert.deepEqual((await list(tasksPath(7)))[1], currentMiddle);
    // Destination history also survives an empty project and reversed arrivals.
    const newDestinationTask = await send(tasksPath(8), 'POST', { title: 'After reserved positions' });
    await move(11, 7, 8);
    await move(12, 7, 8);
    await move(14, 7, 8);
    await move(13, 7, 8);
    await order(8, [14, 12, 13, 11, newDestinationTask.id]);
    await order(7, [created.id]);
    assert.deepEqual((await list(tasksPath(8)))[2], currentMiddle);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
