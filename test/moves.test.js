import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';

async function withServer(run, seed) {
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
  async function download(projectId, status = 200) {
    const response = await fetch(`${base}/api/projects/${projectId}/export`);
    assert.equal(response.status, status);
    if (status === 200) {
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal(response.headers.get('content-disposition'), 'attachment; filename="workboard-project.json"');
    }
    return response.json();
  }
  try {
    if (seed) seed(join(directory, 'tasks.sqlite'));
    await start();
    await run({ api, taskPath, move, download, restart: async () => { await stop(); await start(); } });
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
}

test('moves preserve data, remembered order and summaries through repeated moves and restart', async () => {
  await withServer(async ({ api, taskPath, move, restart }) => {
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
    await restart();
    assert.deepEqual(await api(taskPath(destination)), [existing, saved, newest]);
    assert.deepEqual(await api(taskPath(source)), [remaining]);
    await api(`/${destination.id}`, 'PATCH', { archived: true });
    await move(destination, saved, source, 409);
    await api(`/${destination.id}`, 'PATCH', { archived: false });
    await move(destination, saved, source);
    assert.deepEqual(await api(taskPath(source)), [saved, remaining]);
    await move(source, saved, destination);
    assert.deepEqual(await api(taskPath(destination)), [existing, saved, newest]);
    await move(source, remaining, destination);
    assert.deepEqual(await api(taskPath(destination)), [existing, saved, newest, remaining]);
    assert.deepEqual(await api(taskPath(source)), []);
    await restart();
    assert.deepEqual(await api(taskPath(destination)), [existing, saved, newest, remaining]);
    const summary = await api(`/${destination.id}`);
    assert.deepEqual([summary.completedCount, summary.totalCount], [1, 4]);
  });
});

test('portable export includes all current project tasks in remembered order without changing stored data', async () => {
  await withServer(async ({ api, taskPath, move, download, restart }) => {
    const source = await api('', 'POST', { name: 'MiXeD\t  Project 🌱 <b>literal</b>' }, 201);
    const other = await api('', 'POST', { name: 'Other' }, 201);
    const empty = await api('', 'POST', { name: 'Empty' }, 201);
    const first = await api(taskPath(source), 'POST', { title: 'First\t  TITLE <script>日本語</script>' }, 201);
    const second = await api(taskPath(source), 'POST', { title: 'Second' }, 201);
    await api(taskPath(other), 'POST', { title: 'Must not export from source' }, 201);
    const notes = '  日本語 🌱\r\n\t<script>literal</script>\rLine\nEnd  \u2028';
    const saved = await api(`${taskPath(source)}/${first.id}`, 'PATCH', {
      completed: true, priority: 'High', dueDate: '0001-01-01', notes,
    });
    await move(source, first, other);
    const third = await api(taskPath(source), 'POST', { title: 'Third' }, 201);
    await move(other, first, source);
    await api(`${taskPath(source)}/${first.id}/delete`, 'POST');
    await api(`/${source.id}`, 'PATCH', { defaultPriority: 'Low' });
    const expected = {
      format: 'workboard-project', version: 1,
      project: {
        name: source.name, archived: false, defaultPriority: 'Low',
        tasks: [
          { title: saved.title, completed: true, priority: 'High', dueDate: '0001-01-01',
            notes: '  日本語 🌱\n\t<script>literal</script>\nLine\nEnd  \u2028', deleted: true },
          ...[second, third].map(task => ({ title: task.title, completed: false, priority: 'Normal',
            dueDate: '', notes: '', deleted: false })),
        ],
      },
    };
    const before = await api(taskPath(source));
    const projectsBefore = await api('');
    assert.deepEqual(await download(source.id), expected);
    assert.deepEqual(await api(taskPath(source)), before);
    assert.deepEqual(await api(''), projectsBefore);
    assert.equal((await api(taskPath(source)))[0].notes, notes);
    await api(`/${empty.id}`, 'PATCH', { archived: true });
    assert.deepEqual(await download(empty.id), {
      format: 'workboard-project', version: 1,
      project: { name: 'Empty', archived: true, defaultPriority: 'Normal', tasks: [] },
    });
    await download(999999, 404);
    for (const task of [second, third]) await api(`${taskPath(source)}/${task.id}/delete`, 'POST');
    expected.project.tasks.forEach(task => { task.deleted = true; });
    await api(`/${source.id}`, 'PATCH', { archived: true });
    expected.project.archived = true;
    assert.deepEqual(await download(source.id), expected);
    await restart();
    assert.deepEqual(await download(source.id), expected);
    const summary = await api(`/${source.id}`);
    assert.deepEqual([summary.completedCount, summary.totalCount], [0, 0]);
    await api(`/${source.id}`, 'PATCH', { archived: false });
    await api(`${taskPath(source)}/${first.id}/restore`, 'POST');
    await move(source, first, other);
    await move(other, first, source);
    assert.deepEqual(await api(taskPath(source)), [saved, { ...second, deleted: true }, { ...third, deleted: true }]);
  });
});

test('export upgrades older records with public defaults and preserves original text and order', async () => {
  await withServer(async ({ api, taskPath, download, restart }) => {
    const expected = {
      format: 'workboard-project', version: 1,
      project: { name: 'Old\t  Project', archived: false, defaultPriority: 'Normal', tasks: [
        { title: 'First  TASK', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
      ] },
    };
    assert.deepEqual(await download(7), expected);
    const before = await api(taskPath({ id: 7 }));
    await restart();
    assert.deepEqual(await download(7), expected);
    assert.deepEqual(await api(taskPath({ id: 7 })), before);
  }, path => {
    const db = new DatabaseSync(path);
    try {
      db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
          title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
        INSERT INTO projects VALUES (7, 'Old\t  Project');
        INSERT INTO tasks VALUES (20, 7, 'First  TASK', 1), (30, 7, 'Second', 0)`);
    } finally { db.close(); }
  });
});

test('reverse returns restore independent positions and reserve absent tasks ahead of new arrivals', async () => {
  await withServer(async ({ api, taskPath, move, restart }) => {
    const source = await api('', 'POST', { name: 'Original' }, 201);
    const destination = await api('', 'POST', { name: 'Second' }, 201);
    const third = await api('', 'POST', { name: 'Third' }, 201);
    const first = await api(taskPath(source), 'POST', { title: 'First' }, 201);
    const second = await api(taskPath(source), 'POST', { title: 'Second' }, 201);
    const last = await api(taskPath(source), 'POST', { title: 'Last' }, 201);
    await move(source, last, destination);
    await move(source, first, destination);
    await move(source, second, destination);
    assert.deepEqual(await api(taskPath(destination)), [last, first, second]);
    const created = await api(taskPath(source), 'POST', { title: 'Created while others away' }, 201);
    const arrival = await api(taskPath(third), 'POST', { title: 'First arrival' }, 201);
    await move(third, arrival, source);
    const updated = await api(`${taskPath(destination)}/${first.id}`, 'PATCH', {
      title: 'Current title', completed: true, priority: 'High', dueDate: '2024-02-29',
    });
    await api(`/${source.id}`, 'PATCH', { name: 'Renamed original', archived: true });
    await move(destination, second, source, 409);
    await restart();
    await api(`/${source.id}`, 'PATCH', { archived: false });
    // Return in reverse order, including after a process restart.
    await move(destination, last, source);
    await move(destination, second, source);
    await move(destination, updated, source);
    assert.deepEqual(await api(taskPath(source)), [updated, second, last, created, arrival]);
    // The same tasks have a different remembered order in the other project.
    await move(source, second, destination);
    await move(source, updated, destination);
    await move(source, last, destination);
    assert.deepEqual(await api(taskPath(destination)), [last, updated, second]);
    await restart();
    assert.deepEqual(await api(taskPath(destination)), [last, updated, second]);
    assert.deepEqual(await api(taskPath(source)), [created, arrival]);
    const summary = await api(`/${destination.id}`);
    assert.deepEqual([summary.completedCount, summary.totalCount], [1, 3]);
  });
});

test('upgrading preserves existing position order and remembers it across restarts', async () => {
  await withServer(async ({ api, taskPath, move, restart }) => {
    const source = { id: 1 };
    const destination = { id: 2 };
    const [first, last] = await api(taskPath(source));
    assert.deepEqual([first.title, last.title], ['Earlier position', 'Later position']);
    assert.deepEqual([first.id, last.id], [2, 1]);
    await move(source, last, destination);
    await move(source, first, destination);
    const created = await api(taskPath(source), 'POST', { title: 'New task' }, 201);
    await restart();
    await move(destination, last, source);
    await move(destination, first, source);
    assert.deepEqual(await api(taskPath(source)), [first, last, created]);
    await restart();
    assert.deepEqual(await api(taskPath(source)), [first, last, created]);
  }, path => {
    const db = new DatabaseSync(path);
    try {
      db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
        INSERT INTO projects (name) VALUES ('Legacy source'), ('Legacy destination');
        CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
          title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL
        );
        INSERT INTO tasks (project_id, title, position) VALUES
          (1, 'Later position', 8), (1, 'Earlier position', 3)`);
    } finally { db.close(); }
  });
});

test('notes preserve exact text and task data through edits, moves, archive and restart', async () => {
  await withServer(async ({ api, taskPath, move, restart }) => {
    const source = await api('', 'POST', { name: 'Source' }, 201);
    const destination = await api('', 'POST', { name: 'Destination' }, 201);
    const first = await api(taskPath(source), 'POST', { title: 'First' }, 201);
    const second = await api(taskPath(source), 'POST', { title: 'Second' }, 201);
    assert.equal(first.notes, '');
    assert.equal(second.notes, '');
    const path = `${taskPath(source)}/${first.id}`;
    const original = await api(path, 'PATCH', { completed: true, priority: 'High', dueDate: '2024-02-29' });
    const summary = await api(`/${source.id}`);
    const notes = '  First line\n\t第二行 🌱\n<script>alert("literal")</script> & <b>text</b>  \n';
    const saved = await api(path, 'PATCH', { notes });
    assert.deepEqual(saved, { ...original, notes });
    assert.deepEqual(await api(taskPath(source)), [saved, second]);
    assert.deepEqual(await api(`/${source.id}`), summary);
    for (const invalid of [null, 4, true, [], {}]) {
      await api(path, 'PATCH', { notes: invalid, title: 'Must not change' }, 400);
      assert.deepEqual(await api(taskPath(source)), [saved, second]);
    }
    await api(`${taskPath(destination)}/${first.id}`, 'PATCH', { notes: 'Wrong owner' }, 404);
    await restart();
    assert.deepEqual(await api(taskPath(source)), [saved, second]);
    const renamed = await api(path, 'PATCH', { title: 'Renamed' });
    assert.deepEqual(renamed, { ...saved, title: 'Renamed' });
    await move(source, renamed, destination);
    await move(source, second, destination);
    const changedNotes = `${notes}\nUpdated while away`;
    const changed = await api(`${taskPath(destination)}/${first.id}`, 'PATCH', { notes: changedNotes });
    await restart();
    await move(destination, second, source);
    await move(destination, changed, source);
    assert.deepEqual(await api(taskPath(source)), [changed, second]);
    await api(`/${source.id}`, 'PATCH', { archived: true });
    await api(path, 'PATCH', { notes: 'Blocked' }, 409);
    await restart();
    assert.deepEqual(await api(taskPath(source)), [changed, second]);
    await api(`/${source.id}`, 'PATCH', { archived: false });
    const whitespace = await api(path, 'PATCH', { notes: ' \t\n ' });
    assert.deepEqual(whitespace, { ...changed, notes: ' \t\n ' });
    const cleared = await api(path, 'PATCH', { notes: '', deleted: false });
    assert.deepEqual(cleared, { ...changed, notes: '', deleted: false });
    await restart();
    assert.deepEqual(await api(taskPath(source)), [cleared, second]);
  });
});

test('notes migration preserves prior task fields and remembered positions', async () => {
  await withServer(async ({ api, taskPath, move, restart }) => {
    const source = { id: 1 };
    const destination = { id: 2 };
    const expected = { id: 9, title: 'Saved\t  title', completed: true, priority: 'Low', dueDate: '0001-01-01', notes: '', deleted: false };
    assert.deepEqual(await api(taskPath(source)), [expected]);
    assert.equal((await api('/1')).defaultPriority, 'High');
    assert.equal((await api('/2')).archived, true);
    await api('/2', 'PATCH', { archived: false });
    await move(source, expected, destination);
    const newcomer = await api(taskPath(destination), 'POST', { title: 'New arrival' }, 201);
    const saved = await api(`${taskPath(destination)}/9`, 'PATCH', { notes: 'New notes\n  ' });
    await restart();
    await move(destination, saved, source);
    await move(source, saved, destination);
    assert.deepEqual(await api(taskPath(destination)), [saved, newcomer]);
  }, path => {
    const db = new DatabaseSync(path);
    try {
      db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
          archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
        INSERT INTO projects (name, archived, default_priority) VALUES ('Source', 0, 'High'), ('Destination', 1, 'Low');
        CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
          title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
          due_date TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
        INSERT INTO tasks VALUES (9, 1, 'Saved\t  title', 1, 'Low', '0001-01-01', 4);
        CREATE TABLE task_positions (task_id INTEGER NOT NULL, project_id INTEGER NOT NULL, position INTEGER NOT NULL,
          PRIMARY KEY (task_id, project_id));
        INSERT INTO task_positions VALUES (9, 1, 4), (9, 2, 2)`);
    } finally { db.close(); }
  });
});

test('deletion preserves fields, summaries and reserved positions across restore, moves and restarts', async () => {
  await withServer(async ({ api, taskPath, move, restart }) => {
    const source = await api('', 'POST', { name: 'Source' }, 201);
    const destination = await api('', 'POST', { name: 'Destination' }, 201);
    const first = await api(taskPath(source), 'POST', { title: 'First' }, 201);
    const second = await api(taskPath(source), 'POST', { title: 'Second' }, 201);
    assert.equal(first.deleted, false);
    const path = `${taskPath(source)}/${first.id}`;
    const saved = await api(path, 'PATCH', {
      completed: true, priority: 'High', dueDate: '0001-01-01', notes: '  Notes\n日本語 <b>literal</b>  ',
    });
    const deleted = await api(`${path}/delete`, 'POST');
    assert.deepEqual(deleted, { ...saved, deleted: true });
    const summary = async (project, counts) => {
      const current = await api(`/${project.id}`);
      assert.deepEqual([current.completedCount, current.totalCount], counts);
      const listed = (await api('')).find(row => row.id === project.id);
      assert.deepEqual([listed.completedCount, listed.totalCount], counts);
    };
    await summary(source, [0, 1]);
    await api(`${taskPath(source)}/${second.id}/delete`, 'POST');
    await summary(source, [0, 0]);
    await api(`${taskPath(destination)}/${first.id}/restore`, 'POST', undefined, 404);
    await api(`${taskPath(source)}/999999/delete`, 'POST', undefined, 404);
    await api('/999999/tasks/1/restore', 'POST', undefined, 404);
    for (const edit of [{ title: 'Blocked' }, { completed: false }, { priority: 'Low' },
      { dueDate: '' }, { notes: '' }, { title: 'Blocked', deleted: false }]) {
      await api(path, 'PATCH', edit, 409);
    }
    await move(source, first, destination, 409);
    await api(`/${source.id}`, 'PATCH', { defaultPriority: 'Low', name: 'Renamed source', archived: true });
    await api(`${path}/restore`, 'POST', undefined, 409);
    await api(`${taskPath(source)}/${second.id}/delete`, 'POST', undefined, 409);
    await restart();
    assert.deepEqual(await api(taskPath(source)), [deleted, { ...second, deleted: true }]);
    await summary(source, [0, 0]);
    await api(`/${source.id}`, 'PATCH', { archived: false });
    const later = await api(taskPath(source), 'POST', { title: 'Created after deletion' }, 201);
    assert.equal(later.priority, 'Low');
    await api(`${taskPath(source)}/${second.id}/restore`, 'POST');
    assert.deepEqual(await api(`${path}/restore`, 'POST'), saved);
    assert.deepEqual(await api(taskPath(source)), [saved, second, later]);
    await summary(source, [1, 3]);
    await move(source, first, destination);
    const destinationPath = `${taskPath(destination)}/${first.id}`;
    assert.deepEqual(await api(`${destinationPath}/delete`, 'POST'), deleted);
    await summary(destination, [0, 0]);
    const arriving = await api(taskPath(destination), 'POST', { title: 'Later destination task' }, 201);
    await restart();
    assert.deepEqual(await api(`${destinationPath}/restore`, 'POST'), saved);
    assert.deepEqual(await api(taskPath(destination)), [saved, arriving]);
    await summary(destination, [1, 2]);
    await move(destination, first, source);
    assert.deepEqual(await api(taskPath(source)), [saved, second, later]);
    await restart();
    assert.deepEqual(await api(taskPath(source)), [saved, second, later]);
    await summary(source, [1, 3]);
    await summary(destination, [0, 1]);
  });
});

test('deletion upgrade preserves notes and independent remembered positions and initializes tasks live', async () => {
  await withServer(async ({ api, taskPath, move, restart }) => {
    const first = { id: 1 };
    const second = { id: 2 };
    const tasks = await api(taskPath(first));
    assert.deepEqual(tasks, [{ id: 8, title: 'Saved title', completed: true, priority: 'High',
      dueDate: '2024-02-29', notes: '  Existing\nnotes <b>🌱</b>  ', deleted: false }]);
    const other = await api(taskPath(second));
    const path = `${taskPath(first)}/8`;
    await api(`${path}/delete`, 'POST');
    const later = await api(taskPath(first), 'POST', { title: 'Later' }, 201);
    await restart();
    assert.deepEqual(await api(`${path}/restore`, 'POST'), tasks[0]);
    assert.deepEqual(await api(taskPath(first)), [tasks[0], later]);
    await move(first, tasks[0], second);
    assert.deepEqual(await api(taskPath(second)), [tasks[0], ...other]);
  }, databasePath => {
    const db = new DatabaseSync(databasePath);
    db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, default_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
      title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
      due_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL);
      CREATE TABLE task_positions (task_id INTEGER NOT NULL, project_id INTEGER NOT NULL,
      position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id));
      INSERT INTO projects (id, name) VALUES (1, 'First'), (2, 'Second');
      INSERT INTO tasks VALUES (8, 1, 'Saved title', 1, 'High', '2024-02-29', '  Existing
notes <b>🌱</b>  ', 5), (9, 2, 'Other', 0, 'Low', '', '', 3);
      INSERT INTO task_positions VALUES (8, 1, 5), (8, 2, 1), (9, 2, 3);`);
    db.close();
  });
});
