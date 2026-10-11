import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { filterDirectory, normalizeDueRange } from '../public/task-filters.js';

test('directory filters intersect scope, live/deleted state, priority, dates and title-only search', () => {
  const tasks = [];
  for (const project_archived of [false, true]) {
    for (const deleted of [false, true]) {
      for (const completed of [false, true]) {
        for (const priority of ['Low', 'Normal', 'High']) {
          for (const due_date of ['', '2024-02-28', '2024-02-29', '2024-03-01']) {
            for (const title of ['Review \t REPORT', 'Unrelated', 'Review\nreport']) {
              tasks.push({ id: tasks.length + 1, project_archived, deleted, completed,
                priority, due_date, title, project_name: 'Review report', notes: 'Review report' });
            }
          }
        }
      }
    }
  }
  const before = structuredClone(tasks);
  for (const scope of ['active', 'archived']) {
    for (const completion of ['all', 'open', 'completed', 'deleted']) {
      for (const priority of ['all', 'Low', 'Normal', 'High']) {
        for (const range of [
          normalizeDueRange('', ''), normalizeDueRange('', '2024-02-29'),
          normalizeDueRange('2024-02-29', ''), normalizeDueRange('2024-02-29', '2024-02-29'),
        ]) {
          for (const query of ['', ' \tREVIEW  report\n']) {
            const expected = tasks.filter(task =>
              task.project_archived === (scope === 'archived') &&
              task.deleted === (completion === 'deleted') &&
              (completion !== 'open' || !task.completed) &&
              (completion !== 'completed' || task.completed) &&
              (priority === 'all' || task.priority === priority) &&
              ((!range.from && !range.through) || (task.due_date &&
                (!range.from || task.due_date >= range.from) &&
                (!range.through || task.due_date <= range.through))) &&
              (!query || task.title === 'Review \t REPORT'));
            assert.deepEqual(filterDirectory(tasks, scope, completion, priority, range, query), expected);
          }
        }
      }
    }
  }
  assert.deepEqual(tasks, before);
});

test('directory reads upgraded, imported and moved tasks in owner and remembered order without writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-'));
  const dbPath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Original  Owner'), ('Destination');
    INSERT INTO tasks (project_id, title, completed) VALUES
      (1, 'First  TITLE', 1), (1, 'Second', 0), (2, 'Destination first', 0);`);
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
    const response = await fetch(`${origin}${path}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, method === 'POST' ? 201 : 200);
    return response.json();
  }
  const readDirectory = () => request('/api/task-directory');
  const edit = (project, task, body) => request(`/api/projects/${project}/tasks/${task}`, 'PATCH', body);
  async function snapshot() {
    const projects = await request('/api/projects');
    const tasks = await Promise.all(projects.map(project => request(`/api/projects/${project.id}/tasks`)));
    return { projects, tasks };
  }
  try {
    await start();
    assert.deepEqual(await request('/health'), { status: 'ok' });
    const upgraded = await readDirectory();
    assert.deepEqual(upgraded.map(task => task.id), [1, 2, 3]);
    assert.deepEqual(upgraded[0], { id: 1, project_id: 1, project_name: 'Original  Owner',
      project_archived: false, title: 'First  TITLE', completed: true, priority: 'Normal',
      due_date: '', notes: '', deleted: false });
    for (const path of ['/', '/directory', '/directory.js']) {
      const response = await fetch(`${origin}${path}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), path.endsWith('.js') ? /javascript/ : /text\/html/);
    }
    const notes = '  日本語 😀 <script>literal & text</script>\r\nnext\n  ';
    await edit(1, 1, { notes });
    await edit(1, 1, { priority: 'High' });
    await edit(1, 1, { due_date: '2024-02-29' });
    await edit(1, 1, { destination_project_id: 2 });
    assert.deepEqual((await readDirectory()).map(task => [task.project_id, task.id]), [[1, 2], [2, 3], [2, 1]]);
    const later = await request('/api/projects/1/tasks', 'POST', { title: 'Later' });
    await edit(2, 1, { destination_project_id: 1 });
    await edit(1, 1, { deleted: true });
    await request('/api/projects/1', 'PATCH', { name: 'Renamed\t Owner' });
    await request('/api/projects/2', 'PATCH', { archived: true });
    const importedTasks = [
      { title: '  Imported\t TITLE  ', completed: true, priority: 'Low', dueDate: '',
        notes: '  literal <b>notes</b>\r\nUnicode é 😀  ', deleted: true },
      { title: 'Imported live', completed: false, priority: 'High', dueDate: '0001-01-01', notes: '', deleted: false },
    ];
    const document = JSON.stringify({ format: 'workboard-project', version: 1,
      project: { name: 'Portable', archived: true, defaultPriority: 'High', tasks: importedTasks } });
    const imported = await request('/api/projects/import', 'POST', { name: 'Imported owner', document });
    await request('/api/projects', 'POST', { name: 'Empty' });
    const rows = await readDirectory();
    assert.deepEqual(rows.map(task => [task.project_id, task.title]), [
      [1, 'First  TITLE'], [1, 'Second'], [1, later.title], [2, 'Destination first'],
      [imported.id, importedTasks[0].title], [imported.id, importedTasks[1].title],
    ]);
    assert.equal(rows[0].project_name, 'Renamed\t Owner');
    assert.equal(rows[0].notes, notes);
    assert.equal(rows[0].deleted, true);
    assert.equal(rows[0].priority, 'High');
    assert.equal(rows[0].completed, true);
    assert.equal(rows[0].due_date, '2024-02-29');
    assert.equal(rows[3].project_archived, true);
    assert.equal(rows[4].notes, importedTasks[0].notes.replace(/\r\n?/g, '\n'));
    assert.deepEqual(filterDirectory(rows, 'active', 'all', 'all').map(task => task.title), ['Second', 'Later']);
    assert.deepEqual(filterDirectory(rows, 'active', 'deleted', 'High',
      normalizeDueRange('2024-02-29', '2024-02-29'), ' first TITLE '), [rows[0]]);
    assert.deepEqual(filterDirectory(rows, 'archived', 'deleted', 'all'), [rows[4]]);
    assert.deepEqual(filterDirectory(rows, 'archived', 'all', 'all'), [rows[3], rows[5]]);
    const before = await snapshot();
    // Reads and filtering never write fields, summaries, deletion state or positions.
    for (let index = 0; index < 3; index++) assert.deepEqual(await readDirectory(), rows);
    assert.deepEqual(await snapshot(), before);
    await stop();
    await start();
    assert.deepEqual(await readDirectory(), rows);
    assert.deepEqual(await snapshot(), before);
    await edit(1, 1, { deleted: false });
    const blockedMove = await fetch(`${origin}/api/projects/1/tasks/1`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination_project_id: imported.id }),
    });
    assert.equal(blockedMove.status, 409);
    assert.deepEqual(await blockedMove.json(), { error: 'Archived project' });
    await request(`/api/projects/${imported.id}`, 'PATCH', { archived: false });
    await edit(imported.id, rows[4].id, { deleted: false });
    await edit(imported.id, rows[4].id, { destination_project_id: 1 });
    await edit(1, rows[4].id, { destination_project_id: imported.id });
    const restoredRows = await readDirectory();
    assert.deepEqual(restoredRows.map(task => task.id), rows.map(task => task.id));
    assert.equal(restoredRows[4].deleted, false);
    assert.equal(restoredRows[4].project_archived, false);
    assert.equal(restoredRows[4].notes, rows[4].notes);
    assert.equal(restoredRows[0].notes, notes);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
