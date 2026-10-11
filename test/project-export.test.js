import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Start from the original schema to exercise all public migration defaults.
test('portable export includes all current tasks in order without changing saved data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-export-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Original  Project'), ('Other'), ('Empty');
    INSERT INTO tasks (project_id, title, completed) VALUES
      (1, 'First  TITLE', 1), (1, 'Second', 0), (2, 'Other task', 0);`);
  legacy.close();
  let child;
  let origin;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      let output = '';
      let errors = '';
      const timeout = setTimeout(() => reject(new Error(`Startup timed out: ${errors}`)), 5000);
      child.stderr.on('data', chunk => { errors += chunk; });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${errors}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on port (\d+)/);
        if (match) { origin = `http://127.0.0.1:${match[1]}`; clearTimeout(timeout); resolve(); }
      });
    });
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function request(path, method = 'GET', body) {
    const response = await fetch(`${origin}/api/projects${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  }
  async function download(id) {
    // Query parameters cannot restrict a portable export.
    const response = await fetch(`${origin}/api/projects/${id}/export?filter=deleted&priority=Low&search=no-match`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
    return JSON.parse(await response.text());
  }
  const edit = (task, body) => request(`/1/tasks/${task}`, 'PATCH', body);
  try {
    await start();
    const first = { title: 'First  TITLE', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false };
    const second = { ...first, title: 'Second', completed: false };
    assert.deepEqual(await download(1), {
      format: 'workboard-project', version: 1,
      project: { name: 'Original  Project', archived: false, defaultPriority: 'Normal', tasks: [first, second] },
    });
    assert.deepEqual((await download(3)).project.tasks, []);
    const notes = '  日本語 😀 <script>literal & text</script>\r\nnext\rfinal\n  ';
    await edit(1, { notes });
    await edit(1, { priority: 'High' });
    await edit(1, { due_date: '0001-01-01' });
    await edit(1, { title: 'Renamed\t TITLE' });
    await edit(1, { destination_project_id: 2 });
    await request('/2/tasks/1', 'PATCH', { destination_project_id: 1 });
    await edit(1, { deleted: true });
    await request('/1', 'PATCH', { name: 'Renamed  日本語 Project' });
    await request('/1', 'PATCH', { default_priority: 'Low' });
    const expected = {
      format: 'workboard-project', version: 1,
      project: { name: 'Renamed  日本語 Project', archived: false, defaultPriority: 'Low', tasks: [
        { title: 'Renamed\t TITLE', completed: true, priority: 'High', dueDate: '0001-01-01',
          notes: notes.replace(/\r\n?/g, '\n'), deleted: true }, second,
      ] },
    };
    const before = await request('/1/tasks');
    const projectBefore = await request('/1');
    assert.deepEqual(await download(1), expected);
    assert.deepEqual(await request('/1/tasks'), before);
    assert.deepEqual(await request('/1'), projectBefore);
    assert.equal(before[0].notes, notes);
    assert.equal((await download(2)).project.tasks.length, 1);
    await edit(2, { deleted: true });
    await request('/1', 'PATCH', { archived: true });
    expected.project.archived = true;
    expected.project.tasks[1].deleted = true;
    assert.deepEqual(await download(1), expected);
    await stop();
    await start();
    assert.deepEqual(await download(1), expected);
    assert.equal((await request('/1/tasks'))[0].notes, notes);
    const missing = await fetch(`${origin}/api/projects/999/export`);
    assert.equal(missing.status, 404);
    // Export leaves the remembered position available after restoration/movement.
    await request('/1', 'PATCH', { archived: false });
    await edit(1, { deleted: false });
    await edit(1, { destination_project_id: 2 });
    await request('/2/tasks/1', 'PATCH', { destination_project_id: 1 });
    assert.deepEqual((await request('/1/tasks')).map(task => task.id), [1, 2]);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
