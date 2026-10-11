import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', (chunk) => { diagnostics += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${diagnostics}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${diagnostics}`));
    });
    child.stdout.on('data', (chunk) => {
      const match = /listening on port (\d+)/.exec(String(chunk));
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('combined filters preserve selections, task data, summaries, and archive behavior', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)]
      .map((match) => match[1]);
    const filterForm = (html) => /<form[^>]*class="task-filter">([\s\S]*?)<\/form>/.exec(html)[1];
    const assertFilters = (html, completion, priority) => {
      const form = filterForm(html);
      for (const [id, name, label, options, selected] of [
        ['task-filter', 'filter', 'Task filter', ['All', 'Open', 'Completed'], completion],
        ['priority-filter', 'priorityFilter', 'Priority filter', ['All', 'Low', 'Normal', 'High'], priority],
      ]) {
        assert.match(form, new RegExp(`<label for="${id}">${label}</label>`));
        const control = new RegExp(`<select id="${id}" name="${name}"([^>]*)>([\\s\\S]*?)</select>`).exec(form);
        assert.ok(control);
        assert.match(control[1], /onchange="this.form.requestSubmit\(\)"/);
        assert.doesNotMatch(control[1], /disabled/);
        assert.equal(control[2].trim(), options.map((value) =>
          `<option${value === selected ? ' selected' : ''}>${value}</option>`).join(''));
      }
    };
    // Submit the actual rendered form's hidden fields, as a browser would.
    const edit = async (html, path, values) => {
      const form = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)]
        .find((match) => match[1].includes(`action="${path}"`));
      assert.ok(form, `Rendered edit form ${path}`);
      const fields = Object.fromEntries([...form[2].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)]
        .map((match) => [match[1], match[2]]));
      return post(path, { ...fields, ...values });
    };
    const changeFilter = async (html, name, value) => {
      const fields = Object.fromEntries([...filterForm(html).matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)]
        .map((match) => [match[1], /<option selected>(.*?)<\/option>/.exec(match[2])[1]]));
      fields[name] = value;
      return get(`/projects/1?${new URLSearchParams(fields)}`);
    };
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    // Interleave priority and completion to exercise ordering within intersections.
    const tasks = [
      { title: 'High open', priority: 'High', completed: false },
      { title: 'Low done', priority: 'Low', completed: true },
      { title: 'Normal open', priority: 'Normal', completed: false },
      { title: 'High done', priority: 'High', completed: true },
      { title: 'Low open', priority: 'Low', completed: false },
      { title: 'Normal done', priority: 'Normal', completed: true },
    ];
    for (const [index, task] of tasks.entries()) {
      await post('/projects/1/tasks', { title: task.title });
      await post(`/projects/1/tasks/${index + 1}/priority`, { priority: task.priority });
      if (task.completed) await post(`/projects/1/tasks/${index + 1}/completion`, { completed: '1' });
    }
    await post('/projects/2/tasks', { title: 'Other project' });
    const originalList = await get('/');
    const originalOther = await get('/projects/2');
    const originalPage = await get('/projects/1');
    assertFilters(originalPage, 'All', 'All');
    // The project-list navigation has no query and resets both filters to All.
    assert.match(originalList, /<form method="get" action="\/projects\/1"><button type="submit">Open project/);
    for (const completion of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const html = await get(`/projects/1?${new URLSearchParams({ filter: completion, priorityFilter: priority })}`);
        assertFilters(html, completion, priority);
        assert.deepEqual(titles(html), tasks.filter((task) =>
          (completion === 'All' || task.completed === (completion === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map((task) => task.title));
      }
    }
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/1'), originalPage);
    assertFilters(await get('/projects/1?filter=Open&priorityFilter=unknown'), 'Open', 'All');
    assertFilters(await get('/projects/1?filter=unknown&priorityFilter=High'), 'All', 'High');

    let html = await changeFilter(originalPage, 'priorityFilter', 'High');
    html = await changeFilter(html, 'filter', 'Open');
    assertFilters(html, 'Open', 'High');
    assert.deepEqual(titles(html), ['High open']);
    html = await changeFilter(html, 'priorityFilter', 'Low');
    assertFilters(html, 'Open', 'Low');
    assert.deepEqual(titles(html), ['Low open']);
    const filteredPath = '/projects/1?filter=Open&priorityFilter=High';
    html = await get(filteredPath);
    for (const [path, values, message] of [
      ['/projects/1/tasks/1/rename', { title: '  ' }, 'Task title is required'],
      ['/projects/1/tasks', { title: '  ' }, 'Task title is required'],
      ['/projects/1/rename', { name: '  ' }, 'Project name is required'],
      ['/projects/1/tasks/1/priority', { priority: 'Urgent' }, 'Task priority is invalid'],
    ]) {
      const response = await edit(html, path, values);
      assert.equal(response.status, 400);
      const invalid = await response.text();
      assertFilters(invalid, 'Open', 'High');
      assert.deepEqual(titles(invalid), ['High open']);
      assert.ok(invalid.includes(message));
    }
    let response = await edit(html, '/projects/1/tasks/1/rename', { title: '  Renamed high  ' });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), filteredPath);
    html = await get(response.headers.get('location'));
    assertFilters(html, 'Open', 'High');
    assert.deepEqual(titles(html), ['Renamed high']);
    assert.match(html, /aria-label="Complete Renamed high" onchange/);
    assert.equal(await get('/'), originalList);
    response = await edit(html, '/projects/1/tasks/1/priority', { priority: 'Low' });
    assert.equal(response.headers.get('location'), filteredPath);
    html = await get(response.headers.get('location'));
    assertFilters(html, 'Open', 'High');
    assert.deepEqual(titles(html), []);
    assert.equal(await get('/'), originalList);
    html = await changeFilter(html, 'priorityFilter', 'Low');
    assert.deepEqual(titles(html), ['Renamed high', 'Low open']);
    response = await edit(html, '/projects/1/tasks/1/completion', { completed: '1' });
    assert.equal(response.headers.get('location'), '/projects/1?filter=Open&priorityFilter=Low');
    html = await get(response.headers.get('location'));
    assertFilters(html, 'Open', 'Low');
    assert.deepEqual(titles(html), ['Low open']);
    html = await changeFilter(html, 'filter', 'Completed');
    assertFilters(html, 'Completed', 'Low');
    assert.deepEqual(titles(html), ['Renamed high', 'Low done']);
    response = await edit(html, '/projects/1/tasks/1/completion', {});
    html = await get(response.headers.get('location'));
    assertFilters(html, 'Completed', 'Low');
    assert.deepEqual(titles(html), ['Low done']);
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/2'), originalOther);
    const savedPage = await get('/projects/1');
    assert.match(savedPage, /aria-label="Complete Renamed high" onchange/);
    assert.match(savedPage, /id="task-priority-1"[^>]*>\s*<option selected>Low/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/projects/1?filter=Completed&priorityFilter=Low'), html);
    await post('/projects/1/archive');
    const archived = await get(filteredPath);
    assertFilters(archived, 'Open', 'High');
    assert.deepEqual(titles(archived), []);
    const archivedLow = await changeFilter(archived, 'priorityFilter', 'Low');
    assertFilters(archivedLow, 'Open', 'Low');
    assert.deepEqual(titles(archivedLow), ['Renamed high', 'Low open']);
    for (const tag of archivedLow.matchAll(/<(?:input|button|select)\b[^>]*>/g)) {
      if (/type="checkbox"|id="new-task-title-|id="task-priority-|<button[^>]*type="submit" disabled/.test(tag[0])) {
        assert.match(tag[0], /disabled/);
      }
    }
    const blocked = await edit(archivedLow, '/projects/1/tasks/1/priority', { priority: 'High' });
    assert.equal(blocked.status, 409);
    assertFilters(await blocked.text(), 'Open', 'Low');
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get(filteredPath), archived);
    assert.match(await get('/?filter=Archived'), /data-testid="project-summary">3\/6 completed/);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/'), originalList);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task priorities migrate, remain independent, and persist through renaming, archive, and restart', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name) VALUES ('First'), ('Second');
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)));
    INSERT INTO tasks (project_id, title, completed) VALUES (1, 'Done', 1), (1, 'Open', 0), (2, 'Other', 0);`);
  legacy.close();
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const priorityControl = (html, id) => {
      const match = new RegExp(`<select id="task-priority-${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
      assert.ok(match, `Priority control for task ${id} exists`);
      return { tag: match[0], options: match[1].trim() };
    };
    const assertPriority = (html, id, priority, disabled = false) => {
      const control = priorityControl(html, id);
      const expected = ['Low', 'Normal', 'High'].map((value) =>
        `<option${value === priority ? ' selected' : ''}>${value}</option>`).join('');
      assert.equal(control.options, expected);
      assert.equal(control.tag.includes(' disabled'), disabled);
      assert.match(html, new RegExp(`<label for="task-priority-${id}">Task priority</label>`));
      assert.match(control.tag, /onchange="this.form.requestSubmit\(\)"/);
    };
    let html = await get('/projects/1');
    assertPriority(html, 1, 'Normal');
    assertPriority(html, 2, 'Normal');
    assertPriority(await get('/projects/2'), 3, 'Normal');
    await post('/projects/1/tasks', { title: 'New' });
    html = await get('/projects/1');
    assertPriority(html, 4, 'Normal');
    const originalList = await get('/');
    const originalOther = await get('/projects/2');
    for (const values of [{}, { priority: '' }, { priority: 'Urgent' }, { priority: 'high' }]) {
      const response = await post('/projects/1/tasks/1/priority', values);
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert"[^>]*>Task priority is invalid/);
      assert.equal(await get('/projects/1'), html);
    }
    for (const path of ['/projects/2/tasks/1/priority', '/projects/1/tasks/3/priority',
      '/projects/1/tasks/999/priority', '/projects/999/tasks/1/priority']) {
      assert.equal((await post(path, { priority: 'High' })).status, 404);
    }
    assert.equal(await get('/projects/1'), html);
    const changed = await post('/projects/1/tasks/1/priority', { priority: 'High', filter: 'Completed' });
    assert.equal(changed.status, 303);
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Completed');
    await post('/projects/1/tasks/2/priority', { priority: 'Low', filter: 'Open' });
    html = await get('/projects/1');
    assertPriority(html, 1, 'High');
    assertPriority(html, 2, 'Low');
    assertPriority(html, 4, 'Normal');
    assert.match(html, /aria-label="Complete Done" checked/);
    assert.match(html, /aria-label="Complete Open" onchange/);
    assert.ok(html.indexOf('<span>Done') < html.indexOf('<span>Open'));
    assert.ok(html.indexOf('<span>Open') < html.indexOf('<span>New'));
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/2'), originalOther);
    const completed = await get('/projects/1?filter=Completed');
    const open = await get('/projects/1?filter=Open');
    assertPriority(completed, 1, 'High');
    assert.doesNotMatch(completed, /task-priority-2|task-priority-4/);
    assertPriority(open, 2, 'Low');
    assertPriority(open, 4, 'Normal');
    assert.doesNotMatch(open, /task-priority-1/);
    await running.stop();
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), html);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(await get('/projects/1?filter=Open'), open);
    await post('/projects/1/tasks/1/rename', { title: '  Renamed  ' });
    await post('/projects/1/rename', { name: 'Renamed project' });
    const renamed = await get('/projects/1');
    assertPriority(renamed, 1, 'High');
    assert.match(renamed, /aria-label="Complete Renamed" checked/);
    await post('/projects/1/archive');
    const archived = await get('/projects/1');
    assertPriority(archived, 1, 'High', true);
    assertPriority(archived, 2, 'Low', true);
    assertPriority(archived, 4, 'Normal', true);
    assertPriority(await get('/projects/1?filter=Completed'), 1, 'High', true);
    assert.equal((await post('/projects/1/tasks/1/priority', { priority: 'Low' })).status, 409);
    assert.equal(await get('/projects/1'), archived);
    await running.stop();
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), archived);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamed);
    await post('/projects/1/tasks/1/priority', { priority: 'Normal' });
    const restored = await get('/projects/1');
    assertPriority(restored, 1, 'Normal');
    assertPriority(restored, 2, 'Low');
    assert.match(await get('/'), /data-testid="project-summary">1\/3 completed/);
    await running.stop();
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), restored);
    assert.equal(await get('/projects/2'), originalOther);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('task renaming preserves ownership, order, completion, filters, and persisted state through archive and restore', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/2/tasks', { title: 'Other project task' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const originalPage = await get('/projects/1');
    const otherPage = await get('/projects/2');
    const originalList = await get('/');
    assert.match(originalPage, /<label for="new-task-title-1">New task title<\/label>/);
    assert.match(originalPage, /<input id="new-task-title-1" name="title" type="text">/);
    assert.equal((originalPage.match(/>Rename task<\/button>/g) ?? []).length, 2);
    for (const values of [{}, { title: '' }, { title: ' \t\n ', filter: 'Completed' }]) {
      const response = await post('/projects/1/tasks/1/rename', values);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert"[^>]*>Task title is required/);
      assert.match(html, /<span>Done<\/span>/);
      assert.match(html, /aria-label="Complete Done" checked/);
      if (values.filter) {
        assert.match(html, /<option selected>Completed<\/option>/);
        assert.doesNotMatch(html, /<span>Pending<\/span>/);
      }
      assert.equal(await get('/projects/1'), originalPage);
    }
    for (const path of ['/projects/2/tasks/1/rename', '/projects/1/tasks/3/rename',
      '/projects/1/tasks/999/rename', '/projects/999/tasks/1/rename']) {
      assert.equal((await post(path, { title: 'Blocked' })).status, 404);
    }
    assert.equal(await get('/projects/1'), originalPage);
    assert.equal(await get('/projects/2'), otherPage);
    const renamed = await post('/projects/1/tasks/1/rename', {
      title: '  Finished <task> "one"  ', filter: 'Completed',
    });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const openRename = await post('/projects/1/tasks/2/rename', { title: '  Still open  ', filter: 'Open' });
    assert.equal(openRename.status, 303);
    assert.equal(openRename.headers.get('location'), '/projects/1?filter=Open');
    const renamedPage = await get('/projects/1');
    assert.match(renamedPage, /<span>Finished &lt;task&gt; &quot;one&quot;<\/span>/);
    assert.match(renamedPage, /aria-label="Complete Finished &lt;task&gt; &quot;one&quot;" checked/);
    assert.match(renamedPage, /aria-label="Complete Still open" onchange/);
    assert.doesNotMatch(renamedPage, /Complete Done|Complete Pending/);
    assert.ok(renamedPage.indexOf('<span>Finished') < renamedPage.indexOf('<span>Still open'));
    assert.match(renamedPage, /action="\/projects\/1\/tasks\/1\/rename"/);
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/2'), otherPage);
    const completedPage = await get('/projects/1?filter=Completed');
    const openPage = await get('/projects/1?filter=Open');
    assert.match(completedPage, /<span>Finished/);
    assert.doesNotMatch(completedPage, /<span>Still open/);
    assert.match(openPage, /<span>Still open/);
    assert.doesNotMatch(openPage, /<span>Finished/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/projects/1?filter=Completed'), completedPage);
    assert.equal(await get('/projects/1?filter=Open'), openPage);
    assert.equal(await get('/'), originalList);
    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.equal((archivedPage.match(/id="new-task-title-\d+" name="title" type="text" disabled/g) ?? []).length, 2);
    assert.equal((archivedPage.match(/<button type="submit" disabled>Rename task<\/button>/g) ?? []).length, 2);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: 'Blocked' })).status, 409);
    assert.equal(await get('/projects/1'), archivedPage);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), originalList);
    assert.equal((await post('/projects/1/tasks/1/rename', { title: '  Restored title  ' })).status, 303);
    const restoredPage = await get('/projects/1');
    assert.match(restoredPage, /aria-label="Complete Restored title" checked/);
    assert.ok(restoredPage.indexOf('<span>Restored title') < restoredPage.indexOf('<span>Still open'));
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal(await get('/'), originalList);
    assert.equal(await get('/projects/2'), otherPage);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('renaming preserves project identity, order, tasks, and persisted state; archived projects reject renaming', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'Original' });
    await post('/projects', { name: 'Second' });
    await post('/projects/1/tasks', { title: 'Done' });
    await post('/projects/1/tasks', { title: 'Pending' });
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    const originalPage = await get('/projects/1');
    assert.match(originalPage, /<label for="new-project-name">New project name<\/label>/);
    assert.match(originalPage, /<input id="new-project-name" name="name" type="text">/);
    assert.match(originalPage, /<button type="submit">Rename project<\/button>/);
    for (const values of [{}, { name: '' }, { name: ' \t\n ' }]) {
      const response = await post('/projects/1/rename', values);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.match(html, /<h1>Original<\/h1>/);
      assert.equal(await get('/projects/1'), originalPage);
    }
    assert.equal((await post('/projects/999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post('/projects/1/rename', { name: '  Renamed <project> "one"  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), '/projects/1?filter=Completed');
    const renamedPage = await get('/projects/1');
    assert.match(renamedPage, /<h1>Renamed &lt;project&gt; &quot;one&quot;<\/h1>/);
    assert.match(renamedPage, /aria-label="Complete Done" checked/);
    assert.match(renamedPage, /aria-label="Complete Pending" onchange/);
    assert.equal((renamedPage.match(/data-testid="task-row"/g) ?? []).length, 2);
    const renamedList = await get('/');
    assert.match(renamedList, /<span>Renamed &lt;project&gt; &quot;one&quot;<\/span>/);
    assert.match(renamedList, /data-testid="project-summary">1\/2 completed/);
    assert.ok(renamedList.indexOf('<span>Renamed') < renamedList.indexOf('<span>Second'));
    assert.match(renamedList, /action="\/projects\/1"/);
    assert.match(await get('/projects/2'), /<h1>Second<\/h1>/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), renamedPage);
    assert.equal(await get('/'), renamedList);
    await post('/projects/1/archive');
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<input id="new-project-name" name="name" type="text" disabled>/);
    assert.match(archivedPage, /<button type="submit" disabled>Rename project<\/button>/);
    const blocked = await post('/projects/1/rename', { name: 'Blocked' });
    assert.equal(blocked.status, 409);
    assert.match(await blocked.text(), /Archived project is read-only/);
    assert.equal(await get('/projects/1'), archivedPage);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), renamedPage);
    const restoredRename = await post('/projects/1/rename', { name: '  Restored name  ' });
    assert.equal(restoredRename.status, 303);
    assert.equal(restoredRename.headers.get('location'), '/projects/1');
    const restoredPage = await get('/projects/1');
    assert.match(restoredPage, /<h1>Restored name<\/h1>/);
    assert.match(restoredPage, /aria-label="Complete Done" checked/);
    const restoredList = await get('/');
    assert.match(restoredList, /data-testid="project-summary">1\/2 completed/);
    assert.ok(restoredList.indexOf('<span>Restored name') < restoredList.indexOf('<span>Second'));
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal(await get('/'), restoredList);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project validation, order, navigation, escaping, and process restart persistence', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let running;
  try {
    running = await start(databasePath);
    const get = (path) => fetch(`${running.baseUrl}${path}`);
    const create = (name) => fetch(`${running.baseUrl}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await get('/')).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    for (const name of ['', '  \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      html = await invalid.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<script>alert("hi")</script>']) {
      const created = await create(name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const beforeRestart = await (await get('/')).text();
    assert.equal((beforeRestart.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(beforeRestart, /<span>First project<\/span>/);
    assert.match(beforeRestart, /&lt;script&gt;alert\(&quot;hi&quot;\)&lt;\/script&gt;/);
    assert.ok(beforeRestart.indexOf('First project') < beforeRestart.indexOf('&lt;script&gt;'));
    const paths = [...beforeRestart.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    html = await (await get(paths[0])).text();
    assert.match(html, /<h1>First project<\/h1>/);
    assert.match(html, /action="\/"[^>]*><button type="submit">Projects<\/button>/);
    assert.equal((await get('/projects/999999')).status, 404);
    const invalid = await create('   ');
    assert.equal(( (await invalid.text()).match(/data-testid="project-row"/g) ?? []).length, 2);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await (await get('/')).text(), beforeRestart);
    assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy projects migrate; archive, summaries, read-only tasks, and restoration persist', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('Legacy');
    CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    INSERT INTO tasks (project_id, title, completed) VALUES
      (1, 'Done', 1), (1, 'Pending', 0);`);
  legacy.close();
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const rows = (html, kind) => (html.match(new RegExp(`data-testid="${kind}-row"`, 'g')) ?? []).length;
    let html = await get('/');
    assert.match(html, /<label for="project-filter">Project filter<\/label>/);
    assert.match(html, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    assert.match(html, />Archive project<\/button>/);
    assert.doesNotMatch(html, />Restore project<\/button>/);
    await post('/projects', { name: 'New project' });
    html = await get('/');
    assert.equal(rows(html, 'project'), 2);
    assert.match(html, /data-testid="project-summary">0\/0 completed/);
    assert.equal(rows(await get('/?filter=Archived'), 'project'), 0);
    assert.equal((await post('/projects/999/archive')).status, 404);
    const archivedResponse = await post('/projects/1/archive');
    assert.equal(archivedResponse.status, 303);
    assert.equal(archivedResponse.headers.get('location'), '/');
    assert.equal(rows(await get('/'), 'project'), 1);
    assert.doesNotMatch(await get('/'), /<span>Legacy<\/span>/);
    const archivedList = await get('/?filter=Archived');
    assert.equal(rows(archivedList, 'project'), 1);
    assert.match(archivedList, /<span>Legacy<\/span>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    const archivedPage = await get('/projects/1');
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(rows(archivedPage, 'task'), 2);
    const checkboxes = [...archivedPage.matchAll(/<input type="checkbox"[^>]*>/g)].map((match) => match[0]);
    assert.equal(checkboxes.length, 2);
    assert.ok(checkboxes.every((checkbox) => checkbox.includes(' disabled')));
    assert.match(checkboxes[0], / checked/);
    assert.doesNotMatch(checkboxes[1], / checked/);
    assert.equal(rows(await get('/projects/1?filter=Open'), 'task'), 1);
    assert.equal(rows(await get('/projects/1?filter=Completed'), 'task'), 1);
    // Disabled controls also have server-side protection against direct writes.
    assert.equal((await post('/projects/1/tasks', { title: 'Blocked' })).status, 409);
    assert.equal((await post('/projects/1/tasks/1/completion')).status, 409);
    assert.equal((await post('/projects/1/tasks/2/completion', { completed: '1' })).status, 409);
    assert.equal(await get('/projects/1'), archivedPage);
    assert.equal(await get('/?filter=Archived'), archivedList);
    const invalid = await post('/projects', { name: ' ', filter: 'Archived' });
    assert.equal(invalid.status, 400);
    html = await invalid.text();
    assert.match(html, /Project name is required/);
    assert.match(html, /<option selected>Archived<\/option>/);
    assert.equal(rows(html, 'project'), 1);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/?filter=Archived'), archivedList);
    assert.equal(await get('/projects/1'), archivedPage);
    const restore = await post('/projects/1/restore');
    assert.equal(restore.status, 303);
    assert.equal(rows(await get('/?filter=Archived'), 'project'), 0);
    html = await get('/');
    assert.equal(rows(html, 'project'), 2);
    assert.ok(html.indexOf('<span>Legacy') < html.indexOf('<span>New project'));
    assert.match(html, /data-testid="project-summary">1\/2 completed/);
    html = await get('/projects/1');
    assert.doesNotMatch(html, /Archived project| disabled/);
    assert.match(html, /aria-label="Complete Done" checked/);
    await post('/projects/1/tasks/2/completion', { completed: '1', filter: 'Open' });
    assert.equal(rows(await get('/projects/1?filter=Open'), 'task'), 0);
    assert.match(await get('/'), /data-testid="project-summary">2\/2 completed/);
    await post('/projects/1/tasks', { title: 'After restore' });
    await post('/projects/1/tasks/1/completion');
    const restoredList = await get('/');
    const restoredPage = await get('/projects/1');
    assert.match(restoredList, /data-testid="project-summary">1\/3 completed/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/'), restoredList);
    assert.equal(await get('/projects/1'), restoredPage);
    assert.equal(rows(await get('/?filter=Archived'), 'project'), 0);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks are validated, scoped, filtered, saved, and restored after process restart', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  let running;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    await post('/projects', { name: 'First' });
    await post('/projects', { name: 'Second' });
    let html = await get('/projects/1');
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    const rows = (value) => [...value.matchAll(/data-testid="task-row"/g)].length;
    assert.equal(rows(html), 0);
    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert"[^>]*>Task title is required/);
    }
    for (const title of ['  First task  ', 'Second <task> "quoted"']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    html = await get('/projects/1');
    assert.equal(rows(html), 2);
    assert.match(html, /<span>First task<\/span>/);
    assert.match(html, /aria-label="Complete First task"/);
    assert.match(html, /aria-label="Complete Second &lt;task&gt; &quot;quoted&quot;"/);
    assert.doesNotMatch(html, / checked/);
    assert.ok(html.indexOf('<span>First task') < html.indexOf('<span>Second'));
    assert.equal(rows(await get('/projects/2')), 0);
    // Ownership also applies to writes, not only rendering.
    assert.equal((await post('/projects/2/tasks/1/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/completion', { completed: '1' })).status, 404);
    assert.equal((await post('/projects/1/tasks/1/completion', { completed: '1' })).status, 303);
    html = await get('/projects/1');
    assert.match(html, /aria-label="Complete First task" checked/);
    assert.equal(rows(html), 2);
    const open = await get('/projects/1?filter=Open');
    assert.equal(rows(open), 1);
    assert.doesNotMatch(open, /<span>First task/);
    assert.match(open, /<option selected>Open<\/option>/);
    const completed = await get('/projects/1?filter=Completed');
    assert.equal(rows(completed), 1);
    assert.match(completed, /<span>First task/);
    assert.doesNotMatch(completed, /<span>Second/);
    assert.equal(rows(await get('/projects/1?filter=unknown')), 2);
    const invalid = await post('/projects/1/tasks', { title: '  ', filter: 'Completed' });
    assert.equal(invalid.status, 400);
    assert.equal(rows(await invalid.text()), 1);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), html);
    assert.equal(await get('/projects/1?filter=Open'), open);
    assert.equal(await get('/projects/1?filter=Completed'), completed);
    assert.equal(rows(await get('/projects/2')), 0);
    const uncheck = await post('/projects/1/tasks/1/completion', { filter: 'Completed' });
    assert.equal(uncheck.status, 303);
    assert.equal(uncheck.headers.get('location'), '/projects/1?filter=Completed');
    assert.equal(rows(await get('/projects/1?filter=Completed')), 0);
    assert.equal(rows(await get('/projects/1?filter=Open')), 2);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.doesNotMatch(await get('/projects/1'), / checked/);
    assert.equal(rows(await get('/projects/1?filter=Open')), 2);
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('project priority defaults migrate and affect only future tasks, preserving filters and archived data', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.workboard-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
    INSERT INTO projects (name, archived) VALUES ('Existing', 0), ('Archived', 1);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL DEFAULT 'Normal');
    INSERT INTO tasks (project_id, title, completed, priority) VALUES
      (1, 'Existing high', 1, 'High'), (1, 'Existing low', 0, 'Low'),
      (2, 'Archived task', 1, 'Low');`);
  legacy.close();
  let running;
  try {
    running = await start(databasePath);
    const get = async (path) => (await fetch(`${running.baseUrl}${path}`)).text();
    const post = (path, values = {}) => fetch(`${running.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const assertDefault = (html, priority, disabled = false) => {
      assert.match(html, /<label for="default-task-priority">Default task priority<\/label>/);
      const control = /<select id="default-task-priority" name="priority"([^>]*)>([\s\S]*?)<\/select>/.exec(html);
      assert.ok(control);
      assert.equal(control[1].includes(' disabled'), disabled);
      assert.match(control[1], /onchange="this.form.requestSubmit\(\)"/);
      assert.equal(control[2].trim(), ['Low', 'Normal', 'High'].map((option) =>
        `<option${priority === option ? ' selected' : ''}>${option}</option>`).join(''));
    };
    const titles = (html) => [...html.matchAll(/data-testid="task-row"[^>]*>\s*<span>(.*?)<\/span>/g)]
      .map((match) => match[1]);
    const taskSection = (html) => html.slice(html.indexOf('<section aria-label="Tasks"'));
    const assertTaskPriority = (html, id, priority) => {
      assert.match(html, new RegExp(`id="task-priority-${id}"[^>]*>[\\s\\S]*?<option selected>${priority}</option>`));
    };
    await post('/projects', { name: 'New project' });
    assertDefault(await get('/projects/1'), 'Normal');
    assertDefault(await get('/projects/2'), 'Normal', true);
    assertDefault(await get('/projects/3'), 'Normal');
    await post('/projects/1/tasks', { title: 'Initial normal' });
    assertTaskPriority(await get('/projects/1'), 4, 'Normal');
    const initialList = await get('/');
    const originalTasks = taskSection(await get('/projects/1'));
    const otherPage = await get('/projects/3');
    const filters = { filter: 'Completed', priorityFilter: 'High' };
    const filteredPath = '/projects/1?filter=Completed&priorityFilter=High';
    const originalFilteredTasks = taskSection(await get(filteredPath));
    // Use the actual rendered form fields, including both current filters.
    const filteredPage = await get(filteredPath);
    const defaultForm = /<form[^>]*class="default-priority">([\s\S]*?)<\/form>/.exec(filteredPage)[1];
    const fields = Object.fromEntries([...defaultForm.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)]
      .map((match) => [match[1], match[2]]));
    assert.deepEqual(fields, filters);
    const change = await post('/projects/1/default-priority', { ...fields, priority: 'High' });
    assert.equal(change.status, 303);
    assert.equal(change.headers.get('location'), filteredPath);
    let html = await get(filteredPath);
    assertDefault(html, 'High');
    assert.match(html, /<option selected>Completed<\/option>/);
    assert.match(html, /id="priority-filter"[^>]*>\s*<option>All<\/option><option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.equal(taskSection(html), originalFilteredTasks);
    assert.equal(taskSection(await get('/projects/1')), originalTasks);
    assert.equal(await get('/'), initialList);
    assert.equal(await get('/projects/3'), otherPage);
    for (const values of [{}, { priority: '' }, { priority: 'Urgent' }, { priority: 'high' }]) {
      const response = await post('/projects/1/default-priority', { ...filters, ...values });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert"[^>]*>Task priority is invalid/);
      assert.equal(await get(filteredPath), html);
    }
    assert.equal((await post('/projects/999/default-priority', { priority: 'Low' })).status, 404);
    await post('/projects/1/tasks', { title: 'Inherited high', ...filters });
    await post('/projects/1/default-priority', { priority: 'Low', ...filters });
    await post('/projects/1/tasks', { title: 'Inherited low' });
    await post('/projects/3/tasks', { title: 'Independent normal' });
    html = await get('/projects/1');
    assert.deepEqual(titles(html), ['Existing high', 'Existing low', 'Initial normal', 'Inherited high', 'Inherited low']);
    for (const [id, priority] of [[1, 'High'], [2, 'Low'], [4, 'Normal'], [5, 'High'], [6, 'Low']]) {
      assertTaskPriority(html, id, priority);
    }
    assertTaskPriority(await get('/projects/3'), 7, 'Normal');
    assert.match(await get('/'), /data-testid="project-summary">1\/5 completed/);
    await post('/projects/1/rename', { name: 'Renamed project', ...filters });
    await post('/projects/1/tasks/5/rename', { title: 'Renamed high' });
    await post('/projects/1/tasks/5/completion', { completed: '1' });
    const savedPage = await get('/projects/1');
    assertDefault(savedPage, 'Low');
    assertTaskPriority(savedPage, 5, 'High');
    assert.match(savedPage, /aria-label="Complete Renamed high" checked/);
    const savedList = await get('/');
    assert.match(savedList, /data-testid="project-summary">2\/5 completed/);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/'), savedList);
    assertDefault(await get('/projects/3'), 'Normal');
    await post('/projects/1/archive');
    const archivedPage = await get(filteredPath);
    assertDefault(archivedPage, 'Low', true);
    assert.deepEqual(titles(archivedPage), ['Existing high', 'Renamed high']);
    assert.equal((await post('/projects/1/default-priority', { priority: 'High', ...filters })).status, 409);
    assert.equal(await get(filteredPath), archivedPage);
    await running.stop();
    running = undefined;
    running = await start(databasePath);
    assert.equal(await get(filteredPath), archivedPage);
    await post('/projects/1/restore');
    assert.equal(await get('/projects/1'), savedPage);
    assert.equal(await get('/'), savedList);
    await post('/projects/1/tasks', { title: 'Restored low' });
    assertTaskPriority(await get('/projects/1'), 8, 'Low');
    await post('/projects/1/default-priority', { priority: 'Normal' });
    assertDefault(await get('/projects/1'), 'Normal');
    assertTaskPriority(await get('/projects/1'), 8, 'Low');
    await post('/projects/1/tasks', { title: 'Later normal' });
    assertTaskPriority(await get('/projects/1'), 9, 'Normal');
  } finally {
    if (running) await running.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
