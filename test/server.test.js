import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('pre-priority databases migrate existing open and completed tasks without data loss', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const dbPath = join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name, archived) VALUES ('Existing project', 1);
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Existing open task', 0), (1, 'Existing completed task', 1);
  `);
  legacy.close();
  try {
    for (let restart = 0; restart < 2; restart++) {
      const child = spawn(process.execPath, ['server.js'], {
        env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      try {
        const port = await new Promise((resolve, reject) => {
          let output = '';
          const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
          child.once('error', (error) => { clearTimeout(timer); reject(error); });
          child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
          child.stdout.on('data', (chunk) => {
            output += chunk;
            const match = output.match(/listening on port (\d+)/);
            if (match) { clearTimeout(timer); resolve(match[1]); }
          });
        });
        const base = `http://127.0.0.1:${port}`;
        assert.deepEqual(await (await fetch(`${base}/api/projects/1/tasks`)).json(), [
          { id: 1, title: 'Existing open task', completed: false, priority: 'Normal' },
          { id: 2, title: 'Existing completed task', completed: true, priority: 'Normal' },
        ]);
        assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [
          { id: 1, name: 'Existing project', archived: 1, total: 2, completed: 1 },
        ]);
      } finally {
        if (child.exitCode === null) {
          const done = once(child, 'exit');
          child.kill('SIGTERM');
          await done;
        }
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('priorities and renames preserve identity, ownership, completion and summaries across archives and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.close();
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.once('error', reject);
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    return `http://127.0.0.1:${port}`;
  }
  async function stop() {
    const done = once(child, 'exit');
    child.kill('SIGTERM');
    await done;
    child = undefined;
  }
  try {
    let base = await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const create = (name) => fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    for (const name of ['', '   \t\n']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Project name is required/);
    }
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    let first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<Second & project>')).json();
    assert.notEqual(first.id, second.id);
    assert.equal(first.archived, 0);
    const expected = [first, second].map((project) => ({ ...project, total: 0, completed: 0 }));
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), expected);
    const page = await fetch(`${base}/projects/${first.id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<label for="project-name">Project name<\/label>/);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    const taskUrl = (project, id = '') => `${base}/api/projects/${project.id}/tasks${id ? `/${id}` : ''}`;
    const createTask = (project, title) => fetch(taskUrl(project), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    const completeTask = (project, task, completed) => fetch(taskUrl(project, task.id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
    });
    const renameTask = (project, task, title) => fetch(taskUrl(project, task.id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    const prioritizeTask = (project, task, priority) => fetch(taskUrl(project, task.id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priority }),
    });
    const readTasks = async (project) => (await fetch(taskUrl(project))).json();
    for (const title of ['', '  \t\n']) {
      const invalid = await createTask(first, title);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Task title is required/);
    }
    assert.deepEqual(await readTasks(first), []);
    const taskResponse = await createTask(first, '  First task  ');
    assert.equal(taskResponse.status, 201);
    let task = await taskResponse.json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    assert.equal(task.priority, 'Normal');
    const nextTask = await (await createTask(first, '<Another & task>')).json();
    const otherTask = await (await createTask(second, 'Other project task')).json();
    assert.equal(nextTask.priority, 'Normal');
    assert.equal(otherTask.priority, 'Normal');
    for (const priority of ['', 'Urgent', 'high', null, 1]) {
      assert.equal((await prioritizeTask(first, task, priority)).status, 400);
      assert.deepEqual(await readTasks(first), [task, nextTask]);
    }
    assert.equal((await prioritizeTask(second, task, 'High')).status, 404);
    assert.equal((await prioritizeTask(first, { id: 99999 }, 'High')).status, 404);
    const high = await prioritizeTask(first, task, 'High');
    assert.equal(high.status, 200);
    assert.deepEqual(await high.json(), { ...task, priority: 'High' });
    task = { ...task, priority: 'High' };
    assert.deepEqual(await (await prioritizeTask(first, nextTask, 'Low')).json(), { ...nextTask, priority: 'Low' });
    nextTask.priority = 'Low';
    assert.deepEqual(await readTasks(first), [task, nextTask]);
    assert.deepEqual(await readTasks(second), [otherTask]);
    assert.equal((await completeTask(second, task, true)).status, 404);
    assert.equal((await completeTask(first, task, 'true')).status, 400);
    assert.deepEqual(await readTasks(first), [task, nextTask]);
    let completed = await (await completeTask(first, task, true)).json();
    assert.deepEqual(completed, { ...task, completed: true });
    assert.deepEqual(await (await completeTask(first, task, false)).json(), task);
    await completeTask(first, task, true);
    for (const title of ['', '  \t\n', null, 42]) {
      const invalid = await renameTask(first, task, title);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Task title is required/);
      assert.deepEqual(await readTasks(first), [completed, nextTask]);
    }
    assert.equal((await renameTask(second, task, 'Wrong project')).status, 404);
    assert.equal((await renameTask(first, { id: 99999 }, 'Missing task')).status, 404);
    const renamedTask = await renameTask(first, task, '  Renamed <task> & title  ');
    assert.equal(renamedTask.status, 200);
    completed = { ...completed, title: 'Renamed <task> & title' };
    task = { ...task, title: completed.title };
    assert.deepEqual(await renamedTask.json(), completed);
    assert.deepEqual(await readTasks(first), [completed, nextTask]);
    assert.deepEqual(await readTasks(second), [otherTask]);
    assert.deepEqual(await (await renameTask(first, nextTask, '  Renamed open task  ')).json(), {
      ...nextTask, title: 'Renamed open task',
    });
    nextTask.title = 'Renamed open task';
    const archive = (project, archived) => fetch(`${base}/api/projects/${project.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived }),
    });
    const rename = (project, name) => fetch(`${base}/api/projects/${project.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    for (const name of ['', '  \t\n']) {
      const invalid = await rename(first, name);
      assert.equal(invalid.status, 400);
      assert.match((await invalid.json()).error, /Project name is required/);
      assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    }
    const renamed = await rename(first, '  Renamed project  ');
    assert.equal(renamed.status, 200);
    assert.deepEqual(await renamed.json(), { ...first, name: 'Renamed project' });
    first = { ...first, name: 'Renamed project' };
    assert.deepEqual(await readTasks(first), [completed, nextTask]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.equal((await rename({ id: 99999 }, 'Missing')).status, 404);
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [
      { ...first, total: 2, completed: 1 }, { ...second, total: 1, completed: 0 },
    ]);
    assert.equal((await archive(first, 'true')).status, 400);
    assert.deepEqual(await (await archive(first, true)).json(), { ...first, archived: 1 });
    assert.equal((await rename(first, 'Cannot rename while archived')).status, 409);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), { ...first, archived: 1 });
    assert.equal((await createTask(first, 'Cannot create while archived')).status, 409);
    assert.equal((await completeTask(first, task, false)).status, 409);
    assert.equal((await renameTask(first, task, 'Cannot rename while archived')).status, 409);
    assert.equal((await prioritizeTask(first, task, 'Normal')).status, 409);
    assert.deepEqual(await readTasks(first), [completed, nextTask]);
    await stop();
    base = await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [
      { ...first, archived: 1, total: 2, completed: 1 }, { ...second, total: 1, completed: 0 },
    ]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), { ...first, archived: 1 });
    assert.deepEqual(await (await fetch(`${base}/api/projects/${second.id}`)).json(), second);
    assert.deepEqual(await readTasks(first), [completed, nextTask]);
    assert.deepEqual(await readTasks(second), [otherTask]);
    assert.equal((await fetch(`${base}/projects/${first.id}`)).status, 200);
    assert.equal((await fetch(`${base}/api/projects/99999/tasks`)).status, 404);
    assert.equal((await fetch(`${base}/api/projects/99999`)).status, 404);
    assert.deepEqual(await (await archive(first, false)).json(), first);
    assert.deepEqual(await readTasks(first), [completed, nextTask]);
    const restoredTitle = 'Restored task';
    assert.deepEqual(await (await prioritizeTask(first, task, 'Normal')).json(), { ...completed, priority: 'Normal' });
    completed = { ...completed, priority: 'Normal' };
    task = { ...task, priority: 'Normal' };
    assert.deepEqual(await (await renameTask(first, task, `  ${restoredTitle}  `)).json(), {
      ...completed, title: restoredTitle,
    });
    completed = { ...completed, title: restoredTitle };
    task = { ...task, title: restoredTitle };
    assert.deepEqual(await (await rename(first, '  Restored project  ')).json(), { ...first, name: 'Restored project' });
    first = { ...first, name: 'Restored project' };
    assert.deepEqual(await (await completeTask(first, task, false)).json(), task);
    await stop();
    base = await start();
    assert.deepEqual(await (await fetch(`${base}/api/projects`)).json(), [
      { ...first, total: 2, completed: 0 }, { ...second, total: 1, completed: 0 },
    ]);
    assert.deepEqual(await readTasks(first), [task, nextTask]);
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
