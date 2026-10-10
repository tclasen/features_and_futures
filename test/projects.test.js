import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('projects validate, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  // Exercise upgrade from the original projects schema as well as fresh task storage.
  const legacy = new DatabaseSync(join(directory, 'projects.sqlite'));
  legacy.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  legacy.close();
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let errors = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'ignore', 'pipe']
    });
    child.stderr.on('data', chunk => { errors += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`Server did not start: ${errors}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function create(name) {
    return fetch(`${base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
  }
  try {
    await start();
    assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: 'ok' });
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    for (const name of ['', '   ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.doesNotMatch(body, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    const list = await (await fetch(base)).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.ok(list.indexOf('First project') < list.indexOf('Second &lt;project&gt;'));
    assert.match(list, /<span>First project<\/span>/);
    const path = list.match(/action="(\/projects\/\d+)" method="get"/)[1];
    const detail = await (await fetch(base + path)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), list);
    assert.equal(await (await fetch(base + path)).text(), detail);
    assert.equal((await fetch(`${base}/projects/999999`)).status, 404);

    async function post(route, values) {
      return fetch(base + route, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
    }
    async function detailPage(filter = 'All', priority = 'All') {
      return (await fetch(`${base}${path}?filter=${filter}&priorityFilter=${priority}`)).text();
    }
    for (const title of ['', '   ']) {
      const response = await post(`${path}/tasks`, { title });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Task title is required/);
      assert.doesNotMatch(body, /data-testid="task-row"/);
    }
    assert.equal((await post(`${path}/tasks`, { title: '  First task  ' })).status, 303);
    assert.equal((await post(`${path}/tasks`, { title: 'Second <task>' })).status, 303);
    let tasks = await detailPage();
    assert.match(tasks, /<label for="task-title">Task title/);
    assert.match(tasks, /<label for="task-filter">Task filter/);
    assert.match(tasks, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal((tasks.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(tasks.indexOf('<span>First task') < tasks.indexOf('<span>Second &lt;task&gt;'));
    assert.match(tasks, /aria-label="Complete First task" onchange/);
    const completion = tasks.match(/action="([^\"]+\/completion)"/)[1];
    assert.equal((await post(completion, { completed: '1' })).status, 303);
    tasks = await detailPage();
    assert.match(tasks, /aria-label="Complete First task" checked/);
    assert.doesNotMatch(await detailPage('Open'), /<span>First task/);
    assert.match(await detailPage('Open'), /<span>Second &lt;task&gt;/);
    assert.match(await detailPage('Completed'), /<span>First task/);
    assert.doesNotMatch(await detailPage('Completed'), /<span>Second &lt;task&gt;/);
    assert.doesNotMatch(await (await fetch(`${base}/projects/2`)).text(), /data-testid="task-row"/);
    assert.equal((await post(completion.replace('/projects/1/', '/projects/2/'), { completed: '0' })).status, 404);
    await stop();
    await start();
    assert.equal(await detailPage(), tasks);
    let summaryList = await (await fetch(base)).text();
    assert.match(summaryList, /<label for="project-filter">Project filter/);
    assert.match(summaryList, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(summaryList, /data-testid="project-summary">1\/2 completed/);
    assert.match(summaryList, /data-testid="project-summary">0\/0 completed/);
    assert.equal((await post(`${path}/archive`, {})).status, 303);
    assert.doesNotMatch(await (await fetch(base)).text(), /<span>First project/);
    const archivedList = await (await fetch(`${base}/?filter=Archived`)).text();
    assert.match(archivedList, /<span>First project/);
    assert.match(archivedList, /Restore project/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    const archivedPage = await detailPage();
    assert.match(archivedPage, /<p>Archived project<\/p>/);
    assert.match(archivedPage, /disabled>Create task/);
    assert.equal((archivedPage.match(/type="checkbox"[^>]* disabled onchange/g) || []).length, 2);
    assert.match(await detailPage('Completed'), /<span>First task/);
    assert.doesNotMatch(await detailPage('Open'), /<span>First task/);
    assert.equal((await post(completion, {})).status, 403);
    assert.equal((await post(`${path}/tasks`, { title: 'Not allowed' })).status, 403);
    await stop();
    await start();
    assert.equal(await detailPage(), archivedPage);
    assert.equal(await (await fetch(`${base}/?filter=Archived`)).text(), archivedList);
    assert.equal((await post(`${path}/restore`, {})).status, 303);
    assert.doesNotMatch(await detailPage(), / disabled/);
    assert.match(await detailPage(), /aria-label="Complete First task" checked/);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await (await fetch(`${base}/?filter=Archived`)).text(), /data-testid="project-row"/);
    await stop();
    await start();
    assert.match(await (await fetch(base)).text(), /<span>First project/);
    assert.equal((await post(completion, {})).status, 303);
    assert.doesNotMatch(await detailPage(), /aria-label="Complete First task" checked/);
    assert.doesNotMatch(await detailPage('Completed'), /data-testid="task-row"/);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">0\/2 completed/);
    await stop();
    await start();
    assert.doesNotMatch(await detailPage(), /aria-label="Complete First task" checked/);

    // Rename keeps the same URL, ordering, tasks, and completion summary.
    assert.equal((await post(completion, { completed: '1' })).status, 303);
    const beforeRename = await detailPage();
    assert.match(beforeRename, /<label for="new-project-name">New project name<\/label>/);
    assert.match(beforeRename, />Rename project<\/button>/);
    for (const name of ['', '   ']) {
      const response = await post(`${path}/rename`, { name });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, /role="alert">Project name is required/);
      assert.match(body, /<h1>First project<\/h1>/);
      assert.equal(await detailPage(), beforeRename);
    }
    assert.equal((await post('/projects/999999/rename', { name: 'Missing' })).status, 404);
    const renamed = await post(`${path}/rename`, { name: '  Renamed <project>  ', filter: 'Completed' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.headers.get('location'), `${path}?filter=Completed`);
    const renamedPage = await detailPage();
    assert.match(renamedPage, /<h1>Renamed &lt;project&gt;<\/h1>/);
    assert.match(renamedPage, /aria-label="Complete First task" checked/);
    assert.match(renamedPage, /<span>Second &lt;task&gt;<\/span>/);
    const renamedList = await (await fetch(base)).text();
    assert.ok(renamedList.indexOf('<span>Renamed &lt;project&gt;') < renamedList.indexOf('<span>Second &lt;project&gt;'));
    assert.match(renamedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(renamedList, new RegExp(`action="${path}" method="get"`));
    await stop();
    await start();
    assert.equal(await detailPage(), renamedPage);
    assert.equal(await (await fetch(base)).text(), renamedList);
    await post(`${path}/archive`, {});
    const archivedRenamedPage = await detailPage();
    assert.match(archivedRenamedPage, /id="new-project-name" name="name" disabled/);
    assert.match(archivedRenamedPage, /disabled>Rename project/);
    assert.equal((await post(`${path}/rename`, { name: 'Forbidden' })).status, 403);
    assert.equal(await detailPage(), archivedRenamedPage);
    await post(`${path}/restore`, {});
    assert.doesNotMatch(await detailPage(), / disabled/);
    assert.equal((await post(`${path}/rename`, { name: 'Restored name' })).status, 303);
    await stop();
    await start();
    assert.match(await detailPage(), /<h1>Restored name<\/h1>/);
    assert.match(await detailPage(), /aria-label="Complete First task" checked/);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/2 completed/);

    // Task renaming preserves completion, order, ownership, and filter membership.
    const taskRename = completion.replace('/completion', '/rename');
    const beforeTaskRename = await detailPage();
    assert.equal((beforeTaskRename.match(/>New task title<\/label>/g) || []).length, 2);
    assert.equal((beforeTaskRename.match(/>Rename task<\/button>/g) || []).length, 2);
    for (const title of ['', '   ']) {
      const response = await post(taskRename, { title });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /role="alert">Task title is required/);
      assert.equal(await detailPage(), beforeTaskRename);
    }
    assert.equal((await post(taskRename.replace('/projects/1/', '/projects/2/'), { title: 'Wrong owner' })).status, 404);
    assert.equal((await post(`${path}/tasks/999999/rename`, { title: 'Missing' })).status, 404);
    const taskRenamed = await post(taskRename, { title: '  Renamed <task> "one"  ', filter: 'Completed' });
    assert.equal(taskRenamed.status, 303);
    assert.equal(taskRenamed.headers.get('location'), `${path}?filter=Completed`);
    const renamedTasks = await detailPage();
    assert.match(renamedTasks, /aria-label="Complete Renamed &lt;task&gt; &quot;one&quot;" checked/);
    assert.ok(renamedTasks.indexOf('<span>Renamed &lt;task&gt;') < renamedTasks.indexOf('<span>Second &lt;task&gt;'));
    assert.doesNotMatch(await detailPage('Open'), /<span>Renamed &lt;task&gt;/);
    assert.match(await detailPage('Completed'), /<span>Renamed &lt;task&gt;/);
    assert.doesNotMatch(await (await fetch(`${base}/projects/2`)).text(), /data-testid="task-row"/);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/2 completed/);
    await stop();
    await start();
    assert.equal(await detailPage(), renamedTasks);
    await post(`${path}/archive`, {});
    const archivedTasks = await detailPage();
    assert.equal((archivedTasks.match(/name="title" disabled/g) || []).length, 2);
    assert.equal((archivedTasks.match(/disabled>Rename task/g) || []).length, 2);
    assert.equal((await post(taskRename, { title: 'Forbidden' })).status, 403);
    assert.equal(await detailPage(), archivedTasks);
    await stop();
    await start();
    assert.equal(await detailPage(), archivedTasks);
    await post(`${path}/restore`, {});
    assert.doesNotMatch(await detailPage(), / disabled/);
    assert.equal((await post(taskRename, { title: 'Restored task' })).status, 303);
    await stop();
    await start();
    assert.match(await detailPage(), /aria-label="Complete Restored task" checked/);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/2 completed/);
    assert.equal((await post(completion, {})).status, 303);
    assert.match(await detailPage('Open'), /<span>Restored task<\/span>/);

    // Priorities default independently and edits preserve all other task fields.
    const priorityRoute = completion.replace('/completion', '/priority');
    const defaultOptions = '<option>Low</option><option selected>Normal</option><option>High</option>';
    assert.equal((await detailPage()).split(defaultOptions).length - 1, 2);
    const beforePriorityList = await (await fetch(base)).text();
    assert.equal((await post(priorityRoute, { priority: 'High', filter: 'Open' })).headers.get('location'), `${path}?filter=Open`);
    let priorityPage = await detailPage();
    assert.match(priorityPage, /<option>Low<\/option><option>Normal<\/option><option selected>High<\/option>/);
    assert.equal(priorityPage.split(defaultOptions).length - 1, 1);
    assert.match(priorityPage, /aria-label="Complete Restored task" onchange/);
    assert.ok(priorityPage.indexOf('<span>Restored task') < priorityPage.indexOf('<span>Second &lt;task&gt;'));
    assert.equal(await (await fetch(base)).text(), beforePriorityList);
    for (const priority of ['', 'Urgent', 'high']) {
      assert.equal((await post(priorityRoute, { priority })).status, 400);
      assert.equal(await detailPage(), priorityPage);
    }
    assert.equal((await post(priorityRoute.replace('/projects/1/', '/projects/2/'), { priority: 'Low' })).status, 404);
    assert.equal((await post(`${path}/tasks/999999/priority`, { priority: 'Low' })).status, 404);
    await stop();
    await start();
    assert.equal(await detailPage(), priorityPage);
    await post(taskRename, { title: 'Priority retained' });
    await post(completion, { completed: '1' });
    assert.match(await detailPage('Completed'), /<option selected>High<\/option>/);
    assert.doesNotMatch(await detailPage('Open'), /<option selected>High<\/option>/);
    await post(`${path}/archive`, {});
    priorityPage = await detailPage();
    assert.equal((priorityPage.match(/name="priority" disabled/g) || []).length, 2);
    assert.equal((await post(priorityRoute, { priority: 'Low' })).status, 403);
    await stop();
    await start();
    assert.equal(await detailPage(), priorityPage);
    await post(`${path}/restore`, {});
    assert.doesNotMatch(await detailPage(), /name="priority" disabled/);
    assert.match(await detailPage(), /<option selected>High<\/option>/);
    assert.equal((await post(priorityRoute, { priority: 'Low' })).status, 303);
    assert.match(await detailPage(), /<option selected>Low<\/option>/);
    await post(`${path}/tasks`, { title: 'New normal task' });
    assert.equal((await detailPage()).split(defaultOptions).length - 1, 2);
    priorityPage = await detailPage();
    await stop();
    await start();
    assert.equal(await detailPage(), priorityPage);

    // Combined filters intersect, preserve selections through edits, and never change summaries.
    const prioritySelect = (value) => `<select id="priority-filter" name="priorityFilter" onchange="this.form.requestSubmit()">${['All', 'Low', 'Normal', 'High'].map(option => `<option${option === value ? ' selected' : ''}>${option}</option>`).join('')}</select>`;
    const rows = html => [...html.matchAll(/<\/form><span>(.*?)<\/span>/g)].map(match => match[1]);
    const expectedTasks = [
      { title: 'Priority retained', completed: true, priority: 'Low' },
      { title: 'Second &lt;task&gt;', completed: false, priority: 'Normal' },
      { title: 'New normal task', completed: false, priority: 'Normal' }
    ];
    const summaryBeforeFilters = await (await fetch(base)).text();
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        const filtered = await detailPage(filter, priority);
        assert.deepEqual(rows(filtered), expectedTasks.filter(task =>
          (filter === 'All' || task.completed === (filter === 'Completed')) &&
          (priority === 'All' || task.priority === priority)).map(task => task.title));
        assert.ok(filtered.includes(prioritySelect(priority)));
        assert.match(filtered, new RegExp(`<option selected>${filter}</option>`));
      }
    }
    assert.equal(await (await fetch(base)).text(), summaryBeforeFilters);
    assert.ok((await (await fetch(base + path)).text()).includes(prioritySelect('All')));

    const selected = { filter: 'Completed', priorityFilter: 'Low' };
    const renamedWithFilters = await post(taskRename, { ...selected, title: '  Combined task  ' });
    assert.equal(renamedWithFilters.headers.get('location'), `${path}?filter=Completed&priorityFilter=Low`);
    assert.deepEqual(rows(await detailPage('Completed', 'Low')), ['Combined task']);
    const invalidRename = await post(taskRename, { ...selected, title: '  ' });
    const invalidPage = await invalidRename.text();
    assert.match(invalidPage, /Task title is required/);
    assert.ok(invalidPage.includes(prioritySelect('Low')));
    assert.match(invalidPage, /<option selected>Completed<\/option>/);
    const changedPriority = await post(priorityRoute, { ...selected, priority: 'High' });
    assert.equal(changedPriority.headers.get('location'), `${path}?filter=Completed&priorityFilter=Low`);
    assert.deepEqual(rows(await (await fetch(base + changedPriority.headers.get('location'))).text()), []);
    assert.deepEqual(rows(await detailPage('Completed', 'High')), ['Combined task']);
    assert.equal(await (await fetch(base)).text(), summaryBeforeFilters);
    const changedCompletion = await post(completion, { filter: 'Completed', priorityFilter: 'High' });
    const completionPage = await (await fetch(base + changedCompletion.headers.get('location'))).text();
    assert.deepEqual(rows(completionPage), []);
    assert.ok(completionPage.includes(prioritySelect('High')));
    assert.match(completionPage, /<option selected>Completed<\/option>/);
    assert.deepEqual(rows(await detailPage('Open', 'High')), ['Combined task']);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">0\/3 completed/);
    await stop();
    await start();
    assert.deepEqual(rows(await detailPage('Open', 'High')), ['Combined task']);
    await post(`${path}/archive`, {});
    const combinedArchived = await detailPage('Open', 'High');
    assert.deepEqual(rows(combinedArchived), ['Combined task']);
    assert.ok(combinedArchived.includes(prioritySelect('High')));
    assert.match(combinedArchived, /name="priority" disabled/);
    assert.match(combinedArchived, /name="title" disabled/);
    assert.match(combinedArchived, /type="checkbox"[^>]* disabled/);
    assert.deepEqual(rows(await detailPage('Completed', 'High')), []);
    await post(`${path}/restore`, {});
    assert.doesNotMatch(await detailPage('Open', 'High'), / disabled/);
    // Return the task to the state expected by the legacy migration assertions below.
    await post(taskRename, { title: 'Priority retained' });
    await post(completion, { completed: '1' });

    // Upgrade a pre-priority database containing tasks without losing their data.
    await stop();
    const previous = new DatabaseSync(join(directory, 'projects.sqlite'));
    previous.exec('ALTER TABLE tasks DROP COLUMN priority');
    previous.close();
    await start();
    assert.equal((await detailPage()).split(defaultOptions).length - 1, 3);
    assert.match(await detailPage(), /aria-label="Complete Priority retained" checked/);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">1\/3 completed/);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
