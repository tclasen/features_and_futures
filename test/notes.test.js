import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server.js';

test('notes migrate, preserve plain text and task data, travel with moves, and respect archive rules', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-notes-'));
  const dbPath = join(directory, 'database.sqlite');
  let server;
  let url;
  const start = async () => {
    server = createApplication(dbPath);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const post = (path, values = {}) => fetch(`${url}${path}`, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const html = async path => (await fetch(`${url}${path}`)).text();
  const snapshot = () => {
    const db = new DatabaseSync(dbPath);
    try {
      return {
        tasks: db.prepare('SELECT * FROM tasks ORDER BY id').all().map(row => ({ ...row })),
        positions: db.prepare('SELECT * FROM task_positions ORDER BY project_id, position').all().map(row => ({ ...row })),
        projects: db.prepare('SELECT * FROM projects ORDER BY id').all().map(row => ({ ...row })),
      };
    } finally {
      db.close();
    }
  };
  const textarea = (text, id) => text.match(new RegExp(`<textarea id="task-notes-${id}"[^>]*>[\\s\\S]*?</textarea>`))[0];
  const filters = {
    filter: 'Completed', priorityFilter: 'High', rangeFrom: '2025-01-01',
    rangeThrough: '2025-12-31', search: 'OLD TASK',
  };
  const filteredPath = `/projects/1?${new URLSearchParams(filters)}`;
  const save = (notes, project = 1, task = 1) => post(`/projects/${project}/tasks/${task}/notes`, { ...filters, notes });
  try {
    // A pre-notes database with existing ordering and independently saved task fields.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
        default_priority TEXT NOT NULL DEFAULT 'Normal');
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal',
        due_date TEXT NOT NULL DEFAULT '', task_order INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE task_positions (
        task_id INTEGER NOT NULL REFERENCES tasks(id), project_id INTEGER NOT NULL REFERENCES projects(id),
        position INTEGER NOT NULL, PRIMARY KEY (task_id, project_id));
      INSERT INTO projects (name, default_priority) VALUES ('Source', 'Low'), ('Destination', 'Normal');
      INSERT INTO tasks (project_id, title, completed, priority, due_date, task_order)
        VALUES (1, 'Old task', 1, 'High', '2025-06-15', 4), (1, 'Second', 0, 'Low', '', 8);
      INSERT INTO task_positions VALUES (1, 1, 4), (2, 1, 8);`);
    legacy.close();
    const original = snapshot();
    await start();
    const migrated = snapshot();
    assert.deepEqual(migrated, { ...original, tasks: original.tasks.map(task => ({ ...task, notes: '' })) });
    const before = await html(filteredPath);
    assert.match(before, /<label for="task-notes-1">Task notes<\/label>/);
    assert.match(textarea(before, 1), />\s*<\/textarea>/);
    assert.match(before, />Save notes<\/button>/);
    const summary = await html('/');
    const notes = '\n  Leading spaces\nUnicode: café 雪 📝\n</textarea><script>alert("x")</script> & \'quoted\'\n\t trailing  \n';
    const response = await save(notes);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), filteredPath);
    const saved = await html(filteredPath);
    assert.match(textarea(saved, 1), />&#10;  Leading spaces&#10;/);
    assert.match(textarea(saved, 1), /&lt;\/textarea&gt;&lt;script&gt;/);
    assert.ok(!saved.includes('<script>alert('));
    assert.deepEqual(snapshot(), { ...migrated, tasks: migrated.tasks.map(task => ({ ...task, notes: task.id === 1 ? notes : '' })) });
    assert.equal(await html('/'), summary);
    assert.equal((saved.match(/data-testid="task-row"/g) ?? []).length, 1);
    assert.equal((await save('wrong owner', 2)).status, 404);
    assert.equal((await save('missing', 1, 999)).status, 404);
    assert.equal(snapshot().tasks[0].notes, notes);
    // Notes do not extend title search matching, and form controls retain all filters.
    assert.doesNotMatch(await html('/projects/1?search=Unicode'), /data-testid="task-row"/);
    assert.match(saved, /<option selected>Completed<\/option>/);
    assert.match(saved, /name="rangeFrom" value="2025-01-01"/);
    assert.match(saved, /id="task-search" name="search" value="OLD TASK"/);
    await stop();
    await start();
    assert.equal(await html(filteredPath), saved);
    await post('/projects/1/tasks', { title: 'New' });
    assert.equal(snapshot().tasks[2].notes, '');
    // Moves and return positions preserve current notes, not an earlier snapshot.
    await post('/projects/1/tasks/1/move', { ...filters, destinationId: '2' });
    assert.doesNotMatch(await html(filteredPath), /data-testid="task-row"/);
    assert.equal(snapshot().tasks[0].notes, notes);
    assert.match(textarea(await html('/projects/2'), 1), /Unicode: café 雪 📝/);
    await save('  Updated in destination\nsecond line  ', 2);
    await post('/projects/2/tasks/1/move', { destinationId: '1' });
    const returned = await html('/projects/1');
    assert.ok(returned.indexOf('id="task-1"') < returned.indexOf('id="task-2"'));
    assert.deepEqual(snapshot().positions.filter(position => position.project_id === 1), [
      ...migrated.positions, { task_id: 3, project_id: 1, position: 9 },
    ]);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed task' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    assert.equal(snapshot().tasks[0].notes, '  Updated in destination\nsecond line  ');
    await post('/projects/1/archive');
    const archived = await html('/projects/1');
    assert.match(textarea(archived, 1), /rows="4" disabled>/);
    assert.match(archived, /<button type="submit" disabled>Save notes<\/button>/);
    const archivedData = snapshot();
    assert.equal((await save('forbidden')).status, 403);
    assert.deepEqual(snapshot(), archivedData);
    await stop();
    await start();
    assert.equal(await html('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.doesNotMatch(textarea(await html('/projects/1'), 1), /disabled/);
    // Whitespace-only notes are saved verbatim, not treated as an empty value.
    await save(' \t\n  ');
    assert.equal(snapshot().tasks[0].notes, ' \t\n  ');
    await save('');
    assert.equal(snapshot().tasks[0].notes, '');
    await stop();
    await start();
    assert.match(textarea(await html('/projects/1'), 1), /><\/textarea>/);
    assert.equal(snapshot().tasks[0].notes, '');
  } finally {
    if (server?.listening) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
