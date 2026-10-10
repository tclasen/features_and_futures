import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    url,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects and tasks validate, filter, isolate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'nested', 'projects.sqlite');
    server = await startServer(databasePath);
    const health = await fetch(`${server.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    const create = name => fetch(`${server.url}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    const created = await create('  First project  ');
    assert.equal(created.status, 303);
    assert.equal(created.headers.get('location'), '/');
    await create('Second <script>alert("x")</script> & project');
    const list = await (await fetch(server.url)).text();
    assert.equal((list.match(/data-testid="project-row"/g) ?? []).length, 2);
    assert.match(list, /<span>First project<\/span>/);
    assert.match(list, /Second &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; project/);
    assert.ok(list.indexOf('First project') < list.indexOf('Second'));
    const projectPath = /action="(\/projects\/\d+)"/.exec(list)[1];
    const detail = await (await fetch(`${server.url}${projectPath}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${server.url}/projects/99999`)).status, 404);

    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, />Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option value="all" selected>All<\/option>/);
    const createTask = (title, path = projectPath) => fetch(`${server.url}${path}/tasks`, {
      method: 'POST', body: new URLSearchParams({ title }), redirect: 'manual',
    });
    const taskCount = html => (html.match(/data-testid="task-row"/g) ?? []).length;
    const readProject = (query = '') => fetch(`${server.url}${projectPath}${query}`).then(response => response.text());
    for (const title of ['', ' \t\n ']) {
      const invalid = await createTask(title);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(taskCount(html), 0);
    }
    const firstTask = await createTask('  First task  ');
    assert.equal(firstTask.status, 303);
    assert.equal(firstTask.headers.get('location'), projectPath);
    await createTask('Second <script> & "task"');
    const tasks = await readProject();
    assert.equal(taskCount(tasks), 2);
    assert.match(tasks, /<span>First task<\/span>/);
    assert.match(tasks, /aria-label="Complete First task"/);
    assert.match(tasks, /Second &lt;script&gt; &amp; &quot;task&quot;/);
    assert.ok(tasks.indexOf('<span>First task') < tasks.indexOf('<span>Second'));
    assert.doesNotMatch(tasks, / checked/);
    assert.equal(taskCount(await readProject('?filter=open')), 2);
    assert.equal(taskCount(await readProject('?filter=completed')), 0);
    const taskPath = /action="([^" ]+\/tasks\/\d+)"/.exec(tasks)[1];
    const setCompletion = (completed, filter = 'all', path = taskPath) => fetch(`${server.url}${path}`, {
      method: 'POST',
      body: new URLSearchParams({ ...(completed ? { completed: '1' } : {}), filter }),
      redirect: 'manual',
    });
    const complete = await setCompletion(true, 'open');
    assert.equal(complete.status, 303);
    assert.equal(complete.headers.get('location'), `${projectPath}?filter=open`);
    assert.match(await readProject(), /aria-label="Complete First task" checked/);
    const openTasks = await readProject('?filter=open');
    assert.equal(taskCount(openTasks), 1);
    assert.doesNotMatch(openTasks, /<span>First task/);
    const completedTasks = await readProject('?filter=completed');
    assert.equal(taskCount(completedTasks), 1);
    assert.match(completedTasks, /<span>First task/);
    assert.match(completedTasks, /value="completed" selected/);
    assert.equal(taskCount(await readProject('?filter=invalid')), 2);

    const secondPath = [...list.matchAll(/action="(\/projects\/\d+)"/g)][1][1];
    assert.equal(taskCount(await (await fetch(`${server.url}${secondPath}`)).text()), 0);
    assert.equal((await createTask('Other project task', secondPath)).status, 303);
    const otherTasks = await (await fetch(`${server.url}${secondPath}`)).text();
    assert.equal(taskCount(otherTasks), 1);
    assert.doesNotMatch(otherTasks, /<span>First task|<span>Second &lt;/);
    assert.equal((await setCompletion(false, 'all', taskPath.replace(projectPath, secondPath))).status, 404);
    assert.equal((await createTask('Missing', '/projects/99999')).status, 404);
    assert.equal((await setCompletion(true, 'all', `${projectPath}/tasks/99999`)).status, 404);
    await setCompletion(false);
    assert.equal(taskCount(await readProject('?filter=completed')), 0);
    assert.equal(taskCount(await readProject('?filter=open')), 2);
    await setCompletion(true);
    const savedDetail = await readProject();

    await server.stop();
    server = await startServer(databasePath);
    const restored = await (await fetch(server.url)).text();
    assert.equal(restored, list);
    assert.equal(await readProject(), savedDetail);
    assert.equal(await readProject('?filter=completed'), completedTasks);
    assert.equal(await (await fetch(`${server.url}${secondPath}`)).text(), otherTasks);
    await setCompletion(false);
    assert.equal(taskCount(await readProject('?filter=completed')), 0);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});


test('an existing project database gains tasks without changing project IDs', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'data-test-'));
  let server;
  try {
    const databasePath = join(directory, 'legacy.sqlite');
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL CHECK(length(trim(name)) > 0)
        );
        INSERT INTO projects (id, name) VALUES (42, 'Existing project');
      `);
    } finally {
      database.close();
    }
    server = await startServer(databasePath);
    const list = await (await fetch(server.url)).text();
    assert.match(list, /action="\/projects\/42"/);
    const result = await fetch(`${server.url}/projects/42/tasks`, {
      method: 'POST', body: new URLSearchParams({ title: 'New task' }), redirect: 'manual',
    });
    assert.equal(result.status, 303);
    const detail = await (await fetch(`${server.url}/projects/42`)).text();
    assert.match(detail, /<h1>Existing project<\/h1>/);
    assert.match(detail, /<span>New task<\/span>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
