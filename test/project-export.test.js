import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('portable export includes ordered live/deleted state without mutating data, including upgrades and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL
    );
    INSERT INTO projects (id, name) VALUES (1, 'Legacy  Project'), (2, 'Other'), (3, 'Empty');
    INSERT INTO tasks (id, project_id, title, completed, position) VALUES
      (1, 1, 'Later  TASK', 1, 20), (2, 1, 'Earlier\tTask', 0, 10),
      (3, 2, 'Other task', 0, 1);
  `);
  legacy.close();
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
      env: { ...process.env, PORT: String(port), DB_PATH: databasePath },
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
  const read = async (path) => (await fetch(`${base}/api/projects/${path}`)).json();
  async function write(path, body) {
    const response = await fetch(`${base}/api/projects/${path}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  }
  async function exported(project) {
    // UI filters have no influence on the portable document.
    const response = await fetch(`${base}/api/projects/${project}/export?filter=open&priority=Low&search=missing`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
    return JSON.parse(await response.text());
  }
  const portableTask = (title, completed = false) => ({
    title, completed, priority: 'Normal', dueDate: '', notes: '', deleted: false,
  });
  try {
    await start();
    assert.deepEqual(await exported(1), {
      format: 'workboard-project', version: 1,
      project: { name: 'Legacy  Project', archived: false, defaultPriority: 'Normal',
        tasks: [portableTask('Earlier\tTask'), portableTask('Later  TASK', true)] },
    });
    assert.deepEqual((await exported(3)).project.tasks, []);
    assert.equal((await fetch(`${base}/api/projects/99999/export`)).status, 404);
    const notes = '  Ω 日本語 📝\r\n<script>literal</script> & <b>text</b>\rfinal\n  ';
    await write('1', { name: '  Original  NAME Ω  ' });
    await write('1', { default_priority: 'Low' });
    await write('1/tasks/2', { notes });
    await write('1/tasks/2', { priority: 'High' });
    await write('1/tasks/2', { due_date: '0001-01-01' });
    // Moving out, editing, and returning restores order but keeps current fields.
    await write('1/tasks/2', { destination_project_id: 2 });
    assert.deepEqual((await exported(1)).project.tasks, [portableTask('Later  TASK', true)]);
    await write('2/tasks/2', { title: '  Current\t  TITLE  ' });
    await write('2/tasks/2', { destination_project_id: 1 });
    await write('1/tasks/2', { deleted: true });
    const expected = {
      format: 'workboard-project', version: 1,
      project: { name: 'Original  NAME Ω', archived: false, defaultPriority: 'Low', tasks: [
        { title: 'Current\t  TITLE', completed: false, priority: 'High', dueDate: '0001-01-01',
          notes: notes.replace(/\r\n?/g, '\n'), deleted: true },
        portableTask('Later  TASK', true),
      ] },
    };
    assert.deepEqual(await exported(1), expected);
    await write('1/tasks/1', { deleted: true });
    expected.project.tasks[1].deleted = true;
    await write('1', { archived: true });
    expected.project.archived = true;
    await write('3', { archived: true });
    const beforeProject = await read('1');
    const beforeTasks = await read('1/tasks');
    assert.equal(beforeProject.total, 0);
    assert.equal(beforeProject.completed, 0);
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.deepEqual(await exported(1), expected);
      assert.deepEqual((await exported(3)).project, {
        name: 'Empty', archived: true, defaultPriority: 'Normal', tasks: [],
      });
      assert.deepEqual((await exported(2)).project.tasks, [portableTask('Other task')]);
      assert.deepEqual(await read('1'), beforeProject);
      assert.deepEqual(await read('1/tasks'), beforeTasks);
      assert.equal((await read('1/tasks'))[0].notes, notes);
      if (attempt === 0) { await stop(); await start(); }
    }
    await write('1', { archived: false });
    await write('1/tasks/2', { deleted: false });
    await write('1/tasks/2', { destination_project_id: 2 });
    await write('2/tasks/2', { destination_project_id: 1 });
    assert.deepEqual((await read('1/tasks')).map((task) => task.id), [2, 1]);
    assert.equal((await read('1/tasks'))[0].notes, notes);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
