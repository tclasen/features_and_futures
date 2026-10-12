import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks validate, stay isolated, filter, and survive server restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const port = 18080;
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(dir, 'projects.sqlite') },
      stdio: 'ignore'
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('Server exited before ready');
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch { await new Promise(resolve => setTimeout(resolve, 25)); }
    }
    throw new Error('Server did not become ready');
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  const create = name => fetch(`${base}/projects`, {
    method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
  });
  try {
    await start();
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    const invalid = await create('   ');
    assert.equal(invalid.status, 422);
    const invalidPage = await invalid.text();
    assert.match(invalidPage, /role="alert">Project name is required/);
    assert.doesNotMatch(invalidPage, /data-testid="project-row"/);
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('<Second>')).status, 303);
    const listing = await (await fetch(base)).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(listing.indexOf('First project') < listing.indexOf('&lt;Second&gt;'));
    assert.match(listing, /action="\/projects\/1"/);
    const detail = await (await fetch(`${base}/projects/1`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${base}/projects/999`)).status, 404);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), listing);
    assert.equal(await (await fetch(`${base}/projects/1`)).text(), detail);

    const postTask = (path, values) => fetch(`${base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const tasksPage = async (project = 1, filter = 'All') =>
      (await fetch(`${base}/projects/${project}?filter=${filter}`)).text();
    const rowCount = html => (html.match(/data-testid="task-row"/g) || []).length;
    const invalidTask = await postTask('/projects/1/tasks', { title: '   ' });
    assert.equal(invalidTask.status, 422);
    const invalidTaskPage = await invalidTask.text();
    assert.match(invalidTaskPage, /role="alert">Task title is required/);
    assert.equal(rowCount(invalidTaskPage), 0);
    assert.equal((await postTask('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    assert.equal((await postTask('/projects/1/tasks', { title: '<Second task>' })).status, 303);
    let all = await tasksPage();
    assert.equal(rowCount(all), 2);
    assert.ok(all.indexOf('First task') < all.indexOf('&lt;Second task&gt;'));
    assert.match(all, /aria-label="Complete First task"/);
    assert.match(all, /<option selected>All<\/option>/);
    assert.doesNotMatch(all, / checked/);
    assert.equal(rowCount(await tasksPage(2)), 0);
    assert.equal(rowCount(await tasksPage(1, 'Open')), 2);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 0);
    assert.equal((await postTask('/projects/2/tasks/1', { completed: '1' })).status, 404);
    assert.equal((await postTask('/projects/1/tasks/1', { completed: '1' })).status, 303);
    assert.equal(rowCount(await tasksPage(1, 'Open')), 1);
    const completed = await tasksPage(1, 'Completed');
    assert.equal(rowCount(completed), 1);
    assert.match(completed, /First task/);
    assert.doesNotMatch(completed, /Second task/);
    assert.match(completed, / checked/);
    all = await tasksPage();
    await stop();
    await start();
    assert.equal(await tasksPage(), all);
    assert.equal(await tasksPage(1, 'Completed'), completed);
    assert.equal(rowCount(await tasksPage(2)), 0);
    assert.equal((await postTask('/projects/1/tasks/1', {})).status, 303);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 0);
    assert.equal(rowCount(await tasksPage(1, 'Open')), 2);
    await stop();
    await start();
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 0);
    assert.equal(rowCount(await tasksPage(1, 'Open')), 2);

    assert.equal((await postTask('/projects/1/tasks/1', { completed: '1' })).status, 303);
    const active = await (await fetch(base)).text();
    assert.match(active, /data-testid="project-summary">1\/2 completed/);
    assert.match(active, /data-testid="project-summary">0\/0 completed/);
    assert.match(active, /<option selected>Active<\/option>/);
    assert.equal((await postTask('/projects/1/archive', {})).status, 303);
    assert.doesNotMatch(await (await fetch(base)).text(), /First project/);
    const archivedList = await (await fetch(`${base}/?filter=Archived`)).text();
    assert.match(archivedList, /First project/);
    assert.match(archivedList, /Restore project/);
    assert.match(archivedList, /Open project/);
    assert.match(archivedList, /1\/2 completed/);
    const archivedPage = await tasksPage();
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task/);
    assert.equal((archivedPage.match(/aria-label="Complete [^"]*"[^>]* disabled onchange/g) || []).length, 2);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 1);
    assert.equal(rowCount(await tasksPage(1, 'Open')), 1);
    assert.equal((await postTask('/projects/1/tasks', { title: 'Forbidden' })).status, 403);
    assert.equal((await postTask('/projects/1/tasks/1', {})).status, 403);
    await stop();
    await start();
    assert.equal(await tasksPage(), archivedPage);
    assert.equal(await (await fetch(`${base}/?filter=Archived`)).text(), archivedList);
    assert.equal((await postTask('/projects/1/restore', {})).status, 303);
    assert.equal(await (await fetch(base)).text(), active);
    assert.doesNotMatch(await tasksPage(), / disabled[ >]|Archived project/);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 1);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), active);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 1);
    assert.equal((await postTask('/projects/1/tasks/1', {})).status, 303);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 0);

    // Renaming preserves project identity, order, tasks, and completion counts.
    assert.equal((await postTask('/projects/1/tasks/1', { completed: '1' })).status, 303);
    const blankRename = await postTask('/projects/1/rename', { name: '   ' });
    assert.equal(blankRename.status, 422);
    const blankPage = await blankRename.text();
    assert.match(blankPage, /role="alert">Project name is required/);
    assert.match(blankPage, /<h1>First project<\/h1>/);
    assert.equal((await postTask('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await postTask('/projects/1/rename', { name: '  Renamed <project>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=All');
    const renamedPage = await tasksPage();
    assert.match(renamedPage, /<h1>Renamed &lt;project&gt;<\/h1>/);
    assert.match(renamedPage, /<label for="new-project-name">New project name<\/label>/);
    assert.equal(rowCount(renamedPage), 2);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 1);
    const renamedList = await (await fetch(base)).text();
    assert.ok(renamedList.indexOf('Renamed &lt;project&gt;') < renamedList.indexOf('&lt;Second&gt;'));
    assert.match(renamedList, /action="\/projects\/1"/);
    assert.match(renamedList, /1\/2 completed/);
    await stop();
    await start();
    assert.equal(await tasksPage(), renamedPage);
    assert.equal(await (await fetch(base)).text(), renamedList);
    await postTask('/projects/1/archive', {});
    const archivedRenamePage = await tasksPage();
    assert.match(archivedRenamePage, /id="new-project-name"[^>]* disabled/);
    assert.match(archivedRenamePage, /<button type="submit" disabled>Rename project/);
    assert.equal((await postTask('/projects/1/rename', { name: 'Forbidden' })).status, 403);
    await postTask('/projects/1/restore', {});
    assert.equal(await tasksPage(), renamedPage);
    assert.equal((await postTask('/projects/1/rename', { name: 'Restored name' })).status, 303);
    await stop();
    await start();
    assert.match(await tasksPage(), /<h1>Restored name<\/h1>/);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 1);

    // Task renaming changes only the title, retaining ownership and completion.
    const blankTaskRename = await postTask('/projects/1/tasks/1/rename', { title: '   ' });
    assert.equal(blankTaskRename.status, 422);
    assert.match(await blankTaskRename.text(), /role="alert">Task title is required/);
    assert.match(await tasksPage(), /aria-label="Complete First task"/);
    assert.equal((await postTask('/projects/2/tasks/1/rename', { title: 'Wrong owner' })).status, 404);
    assert.equal((await postTask('/projects/1/tasks/999/rename', { title: 'Missing' })).status, 404);
    const taskRenamed = await postTask('/projects/1/tasks/1/rename', {
      title: '  Renamed <task>  ', filter: 'Completed'
    });
    assert.equal(taskRenamed.status, 303);
    assert.equal(taskRenamed.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=All');
    const renamedTasks = await tasksPage();
    assert.match(renamedTasks, /aria-label="Complete Renamed &lt;task&gt;" checked/);
    assert.ok(renamedTasks.indexOf('Renamed &lt;task&gt;') < renamedTasks.indexOf('&lt;Second task&gt;'));
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 1);
    assert.doesNotMatch(await tasksPage(1, 'Open'), /Renamed &lt;task&gt;/);
    assert.equal(rowCount(await tasksPage(2)), 0);
    assert.match(await (await fetch(base)).text(), /1\/2 completed/);
    await stop();
    await start();
    assert.equal(await tasksPage(), renamedTasks);
    await postTask('/projects/1/archive', {});
    const archivedTasks = await tasksPage();
    assert.equal((archivedTasks.match(/id="new-task-title-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((archivedTasks.match(/<button type="submit" disabled>Rename task/g) || []).length, 2);
    assert.equal((await postTask('/projects/1/tasks/1/rename', { title: 'Forbidden' })).status, 403);
    await postTask('/projects/1/restore', {});
    assert.equal(await tasksPage(), renamedTasks);
    assert.equal((await postTask('/projects/1/tasks/2/rename', { title: '  Renamed open task  ' })).status, 303);
    const finalTasks = await tasksPage();
    assert.match(await tasksPage(1, 'Open'), /aria-label="Complete Renamed open task"/);
    await stop();
    await start();
    assert.equal(await tasksPage(), finalTasks);
    assert.match(await (await fetch(base)).text(), /1\/2 completed/);

    // Priority is independent of completion, titles, ownership, and ordering.
    const priorityOptions = (html, id) => html.match(new RegExp(`<select id="task-priority-${id}"[^>]*>([\\s\\S]*?)</select>`))[1].trim();
    const normalOptions = '<option>Low</option><option selected>Normal</option><option>High</option>';
    assert.equal(priorityOptions(finalTasks, 1), normalOptions);
    assert.equal(priorityOptions(finalTasks, 2), normalOptions);
    const summaryBefore = await (await fetch(base)).text();
    const priorityChange = await postTask('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(priorityChange.status, 303);
    assert.equal(priorityChange.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=All');
    assert.equal(priorityOptions(await tasksPage(), 1), '<option>Low</option><option>Normal</option><option selected>High</option>');
    assert.equal(priorityOptions(await tasksPage(), 2), normalOptions);
    assert.equal((await postTask('/projects/2/tasks/1/priority', { priority: 'Low' })).status, 404);
    assert.equal((await postTask('/projects/1/tasks/999/priority', { priority: 'Low' })).status, 404);
    assert.equal((await postTask('/projects/1/tasks/1/priority', { priority: 'Urgent' })).status, 422);
    await postTask('/projects/1/tasks/2/priority', { priority: 'Low' });
    assert.equal(await (await fetch(base)).text(), summaryBefore);
    assert.equal(rowCount(await tasksPage(1, 'Completed')), 1);
    assert.equal(rowCount(await tasksPage(1, 'Open')), 1);
    await postTask('/projects/1/tasks/1/rename', { title: 'Priority retained' });
    const prioritized = await tasksPage();
    assert.match(prioritized, /aria-label="Complete Priority retained" checked/);
    assert.ok(prioritized.indexOf('Priority retained') < prioritized.indexOf('Renamed open task'));
    assert.equal(priorityOptions(prioritized, 1), '<option>Low</option><option>Normal</option><option selected>High</option>');
    assert.equal(priorityOptions(prioritized, 2), '<option selected>Low</option><option>Normal</option><option>High</option>');
    await stop();
    await start();
    assert.equal(await tasksPage(), prioritized);
    await postTask('/projects/1/archive', {});
    const archivedPriorities = await tasksPage();
    assert.equal((archivedPriorities.match(/id="task-priority-\d+"[^>]* disabled/g) || []).length, 2);
    assert.equal((await postTask('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 403);
    await stop();
    await start();
    assert.equal(await tasksPage(), archivedPriorities);
    await postTask('/projects/1/restore', {});
    assert.equal(await tasksPage(), prioritized);
    await postTask('/projects/1/tasks/1/priority', { priority: 'Normal' });
    assert.equal(priorityOptions(await tasksPage(), 1), normalOptions);
    assert.equal(await (await fetch(base)).text(), summaryBefore);

    // Completion and priority filters intersect and survive every edit response.
    const combinedPage = async (filter, priority) =>
      (await fetch(`${base}/projects/1?filter=${filter}&priorityFilter=${priority}`)).text();
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const expected = Number(filter !== 'Open' && ['All', 'Normal'].includes(priority))
          + Number(filter !== 'Completed' && ['All', 'Low'].includes(priority));
        assert.equal(rowCount(await combinedPage(filter, priority)), expected);
      }
    }
    const selected = { filter: 'Completed', priorityFilter: 'Normal' };
    const assertSelected = html => {
      assert.match(html, /<option selected>Completed<\/option>/);
      assert.match(html, /id="priority-filter"[\s\S]*?<option selected>Normal<\/option>/);
      assert.match(html, /name="priorityFilter" value="Normal"/);
    };
    assertSelected(await combinedPage('Completed', 'Normal'));
    const invalidRename = await postTask('/projects/1/tasks/1/rename', { ...selected, title: ' ' });
    assert.equal(invalidRename.status, 422);
    assertSelected(await invalidRename.text());
    const validRename = await postTask('/projects/1/tasks/1/rename', { ...selected, title: '  Combined task  ' });
    assert.equal(validRename.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=Normal');
    let filtered = await combinedPage('Completed', 'Normal');
    assertSelected(filtered);
    assert.match(filtered, /aria-label="Complete Combined task" checked/);
    const changedPriority = await postTask('/projects/1/tasks/1/priority', { ...selected, priority: 'High' });
    assert.equal(changedPriority.headers.get('location'), validRename.headers.get('location'));
    filtered = await combinedPage('Completed', 'Normal');
    assertSelected(filtered);
    assert.equal(rowCount(filtered), 0);
    assert.equal(await (await fetch(base)).text(), summaryBefore);
    await postTask('/projects/1/tasks/1', { filter: 'Completed', priorityFilter: 'High' });
    assert.equal(rowCount(await combinedPage('Completed', 'High')), 0);
    assert.equal(rowCount(await combinedPage('Open', 'High')), 1);
    const saved = await combinedPage('Open', 'High');
    await stop();
    await start();
    assert.equal(await combinedPage('Open', 'High'), saved);
    await postTask('/projects/1/archive', {});
    const archivedFiltered = await combinedPage('Open', 'High');
    assert.equal(rowCount(archivedFiltered), 1);
    assert.match(archivedFiltered, /id="task-priority-1"[^>]* disabled/);
    assert.doesNotMatch(archivedFiltered, /id="(?:task-filter|priority-filter)"[^>]* disabled/);
    await postTask('/projects/1/restore', {});
    assert.equal(await combinedPage('Open', 'High'), saved);
    assert.match(await tasksPage(), /id="priority-filter"[\s\S]*?<option selected>All<\/option>/);

    // Defaults are project-local and never rewrite existing tasks or filters.
    const defaultSelect = html => html.match(/<select id="default-task-priority"[^>]*>[\s\S]*?<\/select>/)[0];
    assert.match(defaultSelect(await tasksPage()), /<option selected>Normal<\/option>/);
    const snapshot = () => {
      const db = new DatabaseSync(join(dir, 'projects.sqlite'));
      try { return db.prepare('SELECT * FROM tasks ORDER BY id').all(); }
      finally { db.close(); }
    };
    const beforeDefault = snapshot();
    const summaryDefault = await (await fetch(base)).text();
    const changeDefault = await postTask('/projects/1/default-priority', {
      ...selected, priority: 'High'
    });
    assert.equal(changeDefault.status, 303);
    assert.equal(changeDefault.headers.get('location'), '/projects/1?filter=Completed&priorityFilter=Normal');
    assertSelected(await combinedPage('Completed', 'Normal'));
    assert.deepEqual(snapshot(), beforeDefault);
    assert.equal(await (await fetch(base)).text(), summaryDefault);
    assert.match(defaultSelect(await tasksPage()), /<option selected>High<\/option>/);
    assert.match(defaultSelect(await tasksPage(2)), /<option selected>Normal<\/option>/);
    await postTask('/projects/1/tasks', { title: 'Inherited high' });
    await postTask('/projects/2/tasks', { title: 'Independent normal' });
    assert.equal(snapshot().find(task => task.title === 'Inherited high').priority, 'High');
    assert.equal(snapshot().find(task => task.title === 'Independent normal').priority, 'Normal');
    await postTask('/projects/1/default-priority', { priority: 'Low' });
    await postTask('/projects/1/tasks', { title: 'Inherited low' });
    assert.equal(snapshot().find(task => task.title === 'Inherited low').priority, 'Low');
    assert.equal(snapshot().find(task => task.title === 'Inherited high').priority, 'High');
    assert.equal((await postTask('/projects/1/default-priority', { priority: 'Invalid' })).status, 422);
    await postTask('/projects/1/rename', { name: 'Default retained' });
    const savedDefaultTasks = snapshot();
    await postTask('/projects/1/archive', {});
    assert.match(defaultSelect(await tasksPage()), / disabled/);
    assert.match(defaultSelect(await tasksPage()), /<option selected>Low<\/option>/);
    assert.equal((await postTask('/projects/1/default-priority', { priority: 'High' })).status, 403);
    await stop();
    await start();
    assert.match(defaultSelect(await tasksPage()), /<option selected>Low<\/option>/);
    await postTask('/projects/1/restore', {});
    assert.doesNotMatch(defaultSelect(await tasksPage()), / disabled/);
    assert.deepEqual(snapshot(), savedDefaultTasks);
    await postTask('/projects/1/tasks', { title: 'After restore' });
    assert.equal(snapshot().find(task => task.title === 'After restore').priority, 'Low');
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('migrates existing tasks to Normal priority without changing saved data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  const path = join(dir, 'legacy.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('Legacy project');
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Legacy task', 1);`);
  db.close();
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '18081', DB_PATH: path }, stdio: 'ignore'
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        ready = (await fetch('http://127.0.0.1:18081/health')).ok;
        if (ready) break;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(ready);
    const html = await (await fetch('http://127.0.0.1:18081/projects/1')).text();
    assert.match(html, /aria-label="Complete Legacy task" checked/);
    assert.match(html, /<option>Low<\/option><option selected>Normal<\/option><option>High<\/option>/);
    assert.match(html, /id="default-task-priority"[\s\S]*?<option selected>Normal<\/option>/);
    const migrated = new DatabaseSync(path);
    try {
      assert.deepEqual({ ...migrated.prepare('SELECT * FROM tasks').get() }, {
        id: 1, project_id: 1, title: 'Legacy task', completed: 1, priority: 'Normal', due_date: '', notes: '', position: 1
      });
    } finally { migrated.close(); }
  } finally {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    await rm(dir, { recursive: true, force: true });
  }
});
