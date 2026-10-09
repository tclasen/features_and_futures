import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function launch(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    let errors = '';
    child.stderr.on('data', (chunk) => { errors += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited ${code}: ${errors}`)));
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
  });
  return {
    url,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('launch contract, validation, creation order and process-restart persistence', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-'));
  let server;
  try {
    const path = join(directory, 'nested', 'projects.sqlite');
    server = await launch(path);
    const get = (route) => fetch(server.url + route);
    const create = (name) => fetch(server.url + '/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const html = await (await get('/')).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    for (const name of ['', ' \t\n ', null, 123]) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Project name is required' });
    }
    assert.deepEqual(await (await get('/api/projects')).json(), []);
    const firstResponse = await create('  First project \n');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>not HTML</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    assert.equal((await get(`/projects/${first.id}`)).status, 200);
    assert.equal((await get('/api/projects/99999')).status, 404);
    const malformed = await fetch(server.url + '/api/projects', { method: 'POST', body: '{' });
    assert.equal(malformed.status, 400);
    await server.stop();
    server = undefined;
    server = await launch(path);
    assert.deepEqual(await (await get('/api/projects')).json(), [first, second]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), first);
    const third = await (await create('Third')).json();
    assert.ok(third.id > second.id);

    const taskRoute = `/api/projects/${first.id}/tasks`;
    const otherTaskRoute = `/api/projects/${second.id}/tasks`;
    const send = (route, method, data) => fetch(server.url + route, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    assert.deepEqual(await (await get(taskRoute)).json(), []);
    for (const title of ['', ' \t\n ', null, 123]) {
      const response = await send(taskRoute, 'POST', { title });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Task title is required' });
    }
    assert.deepEqual(await (await get(taskRoute)).json(), []);
    const taskResponse = await send(taskRoute, 'POST', { title: '  First task \n' });
    assert.equal(taskResponse.status, 201);
    const firstTask = await taskResponse.json();
    assert.equal(firstTask.title, 'First task');
    assert.equal(firstTask.completed, false);
    const secondTask = await (await send(taskRoute, 'POST', { title: '<b>Second task</b>' })).json();
    assert.ok(secondTask.id > firstTask.id);
    assert.deepEqual(await (await get(taskRoute)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await get(otherTaskRoute)).json(), []);
    assert.equal((await send(`${otherTaskRoute}/${firstTask.id}`, 'PATCH', { completed: true })).status, 404);
    assert.equal((await send('/api/projects/99999/tasks', 'POST', { title: 'Orphan' })).status, 404);
    for (const completed of [null, 1, 'true']) {
      assert.equal((await send(`${taskRoute}/${firstTask.id}`, 'PATCH', { completed })).status, 400);
    }
    const update = await send(`${taskRoute}/${firstTask.id}`, 'PATCH', { completed: true });
    assert.equal(update.status, 200);
    firstTask.completed = true;
    assert.deepEqual(await update.json(), firstTask);
    assert.deepEqual(await (await get(taskRoute)).json(), [firstTask, secondTask]);
    const otherTask = await (await send(otherTaskRoute, 'POST', { title: 'Other project task' })).json();
    const beforeTaskRename = await (await get(`/api/projects/${first.id}`)).json();
    for (const title of ['', ' \t\n ', null, 123]) {
      const invalid = await send(`${taskRoute}/${firstTask.id}`, 'PATCH', { title });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Task title is required' });
      assert.deepEqual(await (await get(taskRoute)).json(), [firstTask, secondTask]);
    }
    assert.equal((await send(`${otherTaskRoute}/${firstTask.id}`, 'PATCH', { title: 'Wrong project' })).status, 404);
    const taskRename = await send(`${taskRoute}/${firstTask.id}`, 'PATCH', { title: '  Renamed task \n' });
    assert.equal(taskRename.status, 200);
    firstTask.title = 'Renamed task';
    assert.deepEqual(await taskRename.json(), firstTask);
    assert.deepEqual(await (await get(taskRoute)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await get(`/api/projects/${first.id}`)).json(), beforeTaskRename);

    await server.stop();
    server = undefined;
    server = await launch(path);
    assert.deepEqual(await (await get(taskRoute)).json(), [firstTask, secondTask]);
    assert.deepEqual(await (await get(otherTaskRoute)).json(), [otherTask]);
    assert.equal((await get(`/projects/${first.id}`)).status, 200);
    const reopened = await send(`${taskRoute}/${firstTask.id}`, 'PATCH', { completed: false });
    firstTask.completed = false;
    assert.deepEqual(await reopened.json(), firstTask);
    await server.stop();
    server = undefined;
    server = await launch(path);
    assert.deepEqual(await (await get(taskRoute)).json(), [firstTask, secondTask]);

    const projectRoute = `/api/projects/${first.id}`;
    const beforeRename = await (await get(projectRoute)).json();
    for (const name of ['', ' \t\n ', null, 123]) {
      const invalid = await send(projectRoute, 'PATCH', { name });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Project name is required' });
      assert.deepEqual(await (await get(projectRoute)).json(), beforeRename);
    }
    const renamed = await send(projectRoute, 'PATCH', { name: '  Renamed project \n' });
    assert.equal(renamed.status, 200);
    assert.deepEqual(await renamed.json(), { ...beforeRename, name: 'Renamed project' });
    assert.deepEqual((await (await get('/api/projects')).json()).map((p) => p.id), [first.id, second.id, third.id]);
    assert.equal((await (await get('/api/projects')).json())[0].name, 'Renamed project');
    assert.deepEqual(await (await get(taskRoute)).json(), [firstTask, secondTask]);
    await server.stop();
    server = undefined;
    server = await launch(path);
    assert.deepEqual(await (await get(projectRoute)).json(), { ...beforeRename, name: 'Renamed project' });
    assert.equal((await get(`/projects/${first.id}`)).status, 200);
    let summary = await (await get(projectRoute)).json();
    assert.equal(summary.total, 2);
    assert.equal(summary.completed, 0);
    assert.equal(summary.archived, false);
    await send(`${taskRoute}/${firstTask.id}`, 'PATCH', { completed: true });
    firstTask.completed = true;
    assert.equal((await send(projectRoute, 'PATCH', { archived: 'true' })).status, 400);
    summary = await (await send(projectRoute, 'PATCH', { archived: true })).json();
    assert.equal(summary.archived, true);
    assert.equal(summary.completed, 1);
    assert.equal(summary.total, 2);
    assert.equal((await send(projectRoute, 'PATCH', { name: 'Blocked rename' })).status, 409);
    assert.deepEqual(await (await get(projectRoute)).json(), summary);
    assert.equal((await send(taskRoute, 'POST', { title: 'Blocked' })).status, 409);
    assert.equal((await send(`${taskRoute}/${firstTask.id}`, 'PATCH', { title: 'Blocked rename' })).status, 409);
    assert.equal((await send(`${taskRoute}/${firstTask.id}`, 'PATCH', { completed: false })).status, 409);
    assert.deepEqual(await (await get(taskRoute)).json(), [firstTask, secondTask]);
    await server.stop();
    server = undefined;
    server = await launch(path);
    assert.deepEqual(await (await get(projectRoute)).json(), summary);
    assert.deepEqual((await (await get('/api/projects')).json()).find((p) => p.id === first.id), summary);
    summary = await (await send(projectRoute, 'PATCH', { archived: false })).json();
    assert.equal(summary.archived, false);
    assert.equal(summary.completed, 1);
    const restoredTaskRename = await send(`${taskRoute}/${firstTask.id}`, 'PATCH', { title: '  Restored task  ' });
    assert.equal(restoredTaskRename.status, 200);
    firstTask.title = 'Restored task';
    assert.deepEqual(await restoredTaskRename.json(), firstTask);
    assert.deepEqual(await (await get(projectRoute)).json(), summary);
    assert.deepEqual(await (await get(taskRoute)).json(), [firstTask, secondTask]);
    await server.stop();
    server = undefined;
    server = await launch(path);
    assert.deepEqual(await (await get(projectRoute)).json(), summary);
    assert.equal((await send(`${taskRoute}/${firstTask.id}`, 'PATCH', { completed: false })).status, 200);
    assert.equal((await (await get(projectRoute)).json()).completed, 0);
    const restoredRename = await send(projectRoute, 'PATCH', { name: 'After restoration' });
    assert.equal(restoredRename.status, 200);
    assert.equal((await restoredRename.json()).name, 'After restoration');
    await server.stop();
    server = undefined;
    server = await launch(path);
    assert.equal((await (await get(projectRoute)).json()).name, 'After restoration');
    firstTask.completed = false;
    assert.deepEqual(await (await get(taskRoute)).json(), [firstTask, secondTask]);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
