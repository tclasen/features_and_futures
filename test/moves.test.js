import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

test('moves preserve data, append order and summaries through repeated moves and restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-moves-'));
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'tasks.sqlite') },
      stdio: 'ignore',
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('Server exited before becoming healthy');
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await delay(25); }
    }
    throw new Error('Server did not become healthy');
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
  async function api(path, method = 'GET', body, status = 200) {
    const response = await fetch(`${base}/api/projects${path}`, {
      method, ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    assert.equal(response.status, status);
    return response.json();
  }
  const taskPath = project => `/${project.id}/tasks`;
  const move = (source, task, destination, status = 200) =>
    api(`${taskPath(source)}/${task.id}/move`, 'POST', { destinationProjectId: destination.id }, status);
  try {
    await start();
    const source = await api('', 'POST', { name: 'Source' }, 201);
    const destination = await api('', 'POST', { name: 'Destination' }, 201);
    const archived = await api('', 'POST', { name: 'Archived' }, 201);
    const oldest = await api(taskPath(source), 'POST', { title: 'Oldest task' }, 201);
    const remaining = await api(taskPath(source), 'POST', { title: 'Remaining task' }, 201);
    const existing = await api(taskPath(destination), 'POST', { title: 'Destination task' }, 201);
    const saved = await api(`${taskPath(source)}/${oldest.id}`, 'PATCH', {
      title: 'Renamed task', completed: true, priority: 'High', dueDate: '0001-01-01',
    });
    await api(`/${destination.id}`, 'PATCH', { defaultPriority: 'Low', name: 'Renamed destination' });
    await api(`/${archived.id}`, 'PATCH', { archived: true });
    await move(source, saved, source, 400);
    await move(source, saved, { id: 999999 }, 404);
    await move(source, saved, archived, 409);
    assert.deepEqual(await api(taskPath(source)), [saved, remaining]);
    assert.deepEqual(await move(source, saved, destination), saved);
    assert.deepEqual(await api(taskPath(source)), [remaining]);
    assert.deepEqual(await api(taskPath(destination)), [existing, saved]);
    await api(`${taskPath(source)}/${saved.id}`, 'PATCH', { title: 'Wrong owner' }, 404);
    const sourceSummary = await api(`/${source.id}`);
    const destinationSummary = await api(`/${destination.id}`);
    assert.deepEqual([sourceSummary.completedCount, sourceSummary.totalCount], [0, 1]);
    assert.deepEqual([destinationSummary.completedCount, destinationSummary.totalCount], [1, 2]);
    const newest = await api(taskPath(destination), 'POST', { title: 'New after move' }, 201);
    assert.equal(newest.priority, 'Low');
    assert.deepEqual(await api(taskPath(destination)), [existing, saved, newest]);
    await stop();
    await start();
    assert.deepEqual(await api(taskPath(destination)), [existing, saved, newest]);
    assert.deepEqual(await api(taskPath(source)), [remaining]);
    await api(`/${destination.id}`, 'PATCH', { archived: true });
    await move(destination, saved, source, 409);
    await api(`/${destination.id}`, 'PATCH', { archived: false });
    await move(destination, saved, source);
    assert.deepEqual(await api(taskPath(source)), [remaining, saved]);
    await move(source, saved, destination);
    assert.deepEqual(await api(taskPath(destination)), [existing, newest, saved]);
    await move(source, remaining, destination);
    assert.deepEqual(await api(taskPath(destination)), [existing, newest, saved, remaining]);
    assert.deepEqual(await api(taskPath(source)), []);
    await stop();
    await start();
    assert.deepEqual(await api(taskPath(destination)), [existing, newest, saved, remaining]);
    const summary = await api(`/${destination.id}`);
    assert.deepEqual([summary.completedCount, summary.totalCount], [1, 4]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
