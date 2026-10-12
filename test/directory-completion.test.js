import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('directory bulk completion changes only the saved intersection, persists, and survives moves', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-bulk-'));
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
        assert.equal(response.status, 200);
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
  async function api(path, method = 'GET', body, status = 200) {
    const response = await fetch(`${base}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, status);
    return response.json();
  }
  const portableTask = (overrides = {}) => ({ title: 'Alpha\t  TEAM Ω', completed: false,
    priority: 'High', dueDate: '2024-02-29', notes: '  <b>literal Ω</b>\nlast  ', deleted: false, ...overrides });
  async function importProject(name, archived, tasks) {
    return api('/projects/import', 'POST', { name, document: JSON.stringify({
      format: 'workboard-project', version: 1,
      project: { name, archived, defaultPriority: 'Low', tasks },
    }) }, 201);
  }
  const filters = { scope: 'active', filter: 'open', priority: 'High',
    from: '2024-02-29', through: '2024-03-01', query: '  ALPHA  \tteam Ω  ' };
  const bulk = (completed, changes = {}, status = 200) => api('/task-directory/completion',
    'POST', { ...filters, completed, ...changes }, status);
  try {
    await start();
    const first = await importProject('First', false, [portableTask(),
      portableTask({ completed: true, dueDate: '2024-03-01' }),
      portableTask({ priority: 'Normal' }), portableTask({ dueDate: '' }),
      portableTask({ dueDate: '2024-03-02' }), portableTask({ title: 'Other title' }),
      portableTask({ deleted: true }),
    ]);
    const second = await importProject('Second', false, [portableTask(), portableTask({ title: 'Other' })]);
    await importProject('Archived', true, [portableTask(), portableTask({ deleted: true })]);
    const before = await api('/task-directory');
    const projectsBefore = await api('/projects');
    for (const [changes, status] of [
      [{ scope: 'archived' }, 409], [{ filter: 'deleted' }, 409],
      [{ from: '2023-02-29' }, 400], [{ from: '2024-03-02' }, 400],
      [{ completed: 'true' }, 400], [{ priority: 'Urgent' }, 400],
    ]) {
      await bulk(true, changes, status);
      assert.deepEqual(await api('/task-directory'), before);
    }
    const selected = new Set([before[0].id, before[7].id]);
    let expected = before.map((task) => selected.has(task.id) ? { ...task, completed: true } : task);
    assert.deepEqual(await bulk(true), expected);
    assert.deepEqual(await bulk(true), expected); // Repeating Open has no remaining eligible matches.
    const summaries = projectsBefore.map((project) => project.id === first.id || project.id === second.id
      ? { ...project, completed: project.completed + 1 } : project);
    assert.deepEqual(await api('/projects'), summaries);
    await stop();
    await start();
    assert.deepEqual(await api('/task-directory'), expected);
    assert.deepEqual(await api('/projects'), summaries);
    const reopenIds = new Set([before[0].id, before[1].id, before[7].id]);
    expected = expected.map((task) => reopenIds.has(task.id) ? { ...task, completed: false } : task);
    assert.deepEqual(await bulk(false, { filter: 'completed' }), expected);
    await stop();
    await start();
    assert.deepEqual(await api('/task-directory'), expected);
    // All allows both actions, while an empty search intersection changes nothing.
    assert.deepEqual(await bulk(true, { filter: 'all', query: 'missing' }), expected);
    expected = expected.map((task) => reopenIds.has(task.id) ? { ...task, completed: true } : task);
    assert.deepEqual(await bulk(true, { filter: 'all' }), expected);
    const movedId = before[0].id;
    await api(`/projects/${first.id}/tasks/${movedId}`, 'PATCH', { destination_project_id: second.id });
    const moved = (await api(`/projects/${second.id}/tasks`)).at(-1);
    assert.equal(moved.id, movedId);
    assert.equal(moved.completed, true);
    assert.equal(moved.notes, before[0].notes);
    assert.equal(moved.priority, 'High');
    assert.equal(moved.due_date, '2024-02-29');
    await api(`/projects/${second.id}/tasks/${movedId}`, 'PATCH', { destination_project_id: first.id });
    assert.deepEqual((await api(`/projects/${first.id}/tasks`)).map((task) => task.id), before.slice(0, 7).map((task) => task.id));
    await stop();
    await start();
    assert.deepEqual(await api('/task-directory'), expected);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
