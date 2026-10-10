import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks validate, remain isolated, and persist across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  // Exercise migration from the schema used before archive support.
  const legacy = new DatabaseSync(join(dir, 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.close();
  let child;
  let base;
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  // Use a dynamically imported server and report its listening port via node:http.
  async function launch() {
    const script = `import http from 'node:http';
      const listen = http.Server.prototype.listen;
      http.Server.prototype.listen = function (...args) {
        this.once('listening', () => console.log(this.address().port));
        return listen.apply(this, args);
      };
      await import('./server.js');`;
    child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, DB_PATH: join(dir, 'projects.sqlite'), PORT: '0' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const [chunk] = await once(child.stdout, 'data');
    base = 'http://127.0.0.1:' + chunk.toString().trim();
  }
  async function create(name) {
    return fetch(base + '/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
  }
  try {
    await launch();
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.equal((await create('   ')).status, 400);
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), []);
    const first = await (await create('  Alpha  ')).json();
    const second = await (await create('Beta')).json();
    assert.equal(first.name, 'Alpha');
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), [first, second]);
    assert.equal((await fetch(base + '/projects/' + first.id)).status, 200);
    const tasksURL = '/api/projects/' + first.id + '/tasks';
    async function taskRequest(path, method, body) {
      return fetch(base + path, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    }
    const invalid = await taskRequest(tasksURL, 'POST', { title: '   ' });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /Task title is required/);
    assert.deepEqual(await (await fetch(base + tasksURL)).json(), []);
    const task = await (await taskRequest(tasksURL, 'POST', { title: '  First task  ' })).json();
    assert.equal(task.title, 'First task');
    assert.equal(task.completed, false);
    const nextTask = await (await taskRequest(tasksURL, 'POST', { title: 'Second task' })).json();
    assert.deepEqual(await (await fetch(base + tasksURL)).json(), [task, nextTask]);
    const otherURL = '/api/projects/' + second.id + '/tasks';
    assert.deepEqual(await (await fetch(base + otherURL)).json(), []);
    assert.equal((await taskRequest(otherURL + '/' + task.id, 'PATCH', { completed: true })).status, 404);
    assert.equal((await taskRequest(tasksURL + '/' + task.id, 'PATCH', { completed: 'true' })).status, 400);
    const completed = await (await taskRequest(tasksURL + '/' + task.id, 'PATCH', { completed: true })).json();
    assert.equal(completed.completed, true);
    const projectURL = '/api/projects/' + first.id;
    const summary = await (await fetch(base + projectURL)).json();
    assert.equal(summary.completed, 1);
    assert.equal(summary.total, 2);
    const archived = await (await taskRequest(projectURL, 'PATCH', { archived: true })).json();
    assert.equal(archived.archived, 1);
    assert.equal((await taskRequest(tasksURL, 'POST', { title: 'Blocked' })).status, 409);
    assert.equal((await taskRequest(tasksURL + '/' + task.id, 'PATCH', { completed: false })).status, 409);
    await stop();
    await launch();
    assert.deepEqual(await (await fetch(base + tasksURL)).json(), [completed, nextTask]);
    assert.deepEqual(await (await fetch(base + otherURL)).json(), []);
    assert.equal((await fetch(base + '/projects/' + first.id)).status, 200);
    assert.deepEqual(await (await fetch(base + projectURL)).json(), archived);
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), [archived, second]);
    const restored = await (await taskRequest(projectURL, 'PATCH', { archived: false })).json();
    assert.equal(restored.archived, 0);
    assert.equal(restored.completed, 1);
    assert.equal(restored.total, 2);
    const reopened = await (await taskRequest(tasksURL + '/' + task.id, 'PATCH', { completed: false })).json();
    assert.equal(reopened.completed, false);
    await stop();
    await launch();
    assert.deepEqual(await (await fetch(base + tasksURL)).json(), [reopened, nextTask]);
    const finalProject = { ...first, total: 2, completed: 0 };
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), [finalProject, second]);
    assert.deepEqual(await (await fetch(base + '/api/projects/' + first.id)).json(), finalProject);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
