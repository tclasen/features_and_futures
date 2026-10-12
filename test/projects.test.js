import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const baseUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timer);
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

async function createProject(baseUrl, name) {
  return fetch(`${baseUrl}/projects`, {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
}

function rows(html) {
  return [...html.matchAll(/<li data-testid="project-row">(.*?)<\/li>/gs)].map((match) => match[1]);
}

function taskRows(html) {
  return [...html.matchAll(/<li data-testid="task-row">(.*?)<\/li>/gs)].map((match) => match[1]);
}

async function postForm(baseUrl, path, values) {
  return fetch(baseUrl + path, {
    method: 'POST',
    body: new URLSearchParams(values),
    redirect: 'manual',
  });
}

test('tasks validate, filter, remain project-owned, and persist completion across restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  let server;
  try {
    const databasePath = join(directory, 'workboard.sqlite');
    server = await startServer(databasePath);
    await createProject(server.baseUrl, 'First');
    await createProject(server.baseUrl, 'Second');
    const readProject = async (path = '/projects/1') => (await fetch(server.baseUrl + path)).text();
    const initial = await readProject();
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await postForm(server.baseUrl, '/projects/1/tasks', { title });
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(taskRows(html).length, 0);
    }
    for (const title of ['  First task  ', '<b>Second</b> & "task"']) {
      assert.equal((await postForm(server.baseUrl, '/projects/1/tasks', { title })).status, 303);
    }
    const originalRows = taskRows(await readProject());
    assert.equal(originalRows.length, 2);
    assert.match(originalRows[0], /<span class="name">First task<\/span>/);
    assert.match(originalRows[0], /type="checkbox".*aria-label="Complete First task"/);
    assert.match(originalRows[1], /aria-label="Complete &lt;b&gt;Second&lt;\/b&gt; &amp; &quot;task&quot;"/);
    assert.ok(originalRows.every((row) => !row.includes(' checked')));
    assert.deepEqual(taskRows(await readProject('/projects/1?filter=Open')), originalRows.map((row) => row.replace('value="All"', 'value="Open"')));
    assert.equal(taskRows(await readProject('/projects/1?filter=Completed')).length, 0);
    assert.equal(taskRows(await readProject('/projects/2')).length, 0);

    const completionPath = originalRows[0].match(/action="([^"]+\/completion)"/)[1];
    const checked = await postForm(server.baseUrl, completionPath, { completed: '1', filter: 'Open' });
    assert.equal(checked.status, 303);
    assert.equal(checked.headers.get('location'), '/projects/1?filter=Open');
    assert.equal(taskRows(await readProject('/projects/1?filter=Open')).length, 1);
    const completedRows = taskRows(await readProject('/projects/1?filter=Completed'));
    assert.equal(completedRows.length, 1);
    assert.match(completedRows[0], /aria-label="Complete First task" checked/);
    assert.equal((await postForm(server.baseUrl, completionPath.replace('/projects/1/', '/projects/2/'), { completed: '0' })).status, 404);
    assert.equal((await postForm(server.baseUrl, '/projects/999/tasks', { title: 'Missing' })).status, 404);
    assert.equal((await postForm(server.baseUrl, '/projects/1/tasks/999/completion', { completed: '1' })).status, 404);
    assert.deepEqual(taskRows(await readProject('/projects/1?filter=Completed')), completedRows);
    const invalid = await postForm(server.baseUrl, '/projects/1/tasks', { title: ' ' });
    assert.equal(taskRows(await invalid.text()).length, 2);

    const persistedRows = taskRows(await readProject());
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await readProject()), persistedRows);
    assert.equal(taskRows(await readProject('/projects/2')).length, 0);
    assert.equal((await postForm(server.baseUrl, completionPath, {})).status, 303);
    assert.deepEqual(taskRows(await readProject()), originalRows);
    await postForm(server.baseUrl, '/projects/2/tasks', { title: 'Other project task' });
    assert.equal(taskRows(await readProject('/projects/2')).length, 1);
    assert.deepEqual(taskRows(await readProject()), originalRows);
    assert.equal(taskRows(await readProject('/projects/1?filter=unknown')).length, 2);
    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(taskRows(await readProject()), originalRows);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, navigate, and persist through a server process restart', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const health = await fetch(`${server.baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(server.baseUrl)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<input id="project-name" name="name" type="text"/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal(rows(initial).length, 0);

    for (const name of ['', '  \t\n  ']) {
      const invalid = await createProject(server.baseUrl, name);
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.equal(rows(html).length, 0);
    }

    for (const name of ['  First project  ', '<script>alert("test")</script> & second']) {
      const created = await createProject(server.baseUrl, name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
    }
    const list = await (await fetch(server.baseUrl)).text();
    const projectRows = rows(list);
    assert.equal(projectRows.length, 2);
    assert.match(projectRows[0], /<span class="name">First project<\/span>/);
    assert.match(projectRows[1], /&lt;script&gt;alert\(&quot;test&quot;\)&lt;\/script&gt; &amp; second/);
    const projectPaths = projectRows.map((row) => {
      assert.match(row, />Open project<\/button>/);
      return row.match(/action="(\/projects\/\d+)"/)[1];
    });
    assert.notEqual(projectPaths[0], projectPaths[1]);
    const detail = await (await fetch(server.baseUrl + projectPaths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<form action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${server.baseUrl}/projects/999999`)).status, 404);

    const invalidWithProjects = await createProject(server.baseUrl, ' ');
    assert.deepEqual(rows(await invalidWithProjects.text()), projectRows);
    assert.deepEqual(rows(await (await fetch(server.baseUrl)).text()), projectRows);

    await server.stop();
    server = await startServer(databasePath);
    assert.deepEqual(rows(await (await fetch(server.baseUrl)).text()), projectRows);
    for (const path of projectPaths) {
      assert.equal((await fetch(server.baseUrl + path)).status, 200);
    }
    assert.equal((await createProject(server.baseUrl, 'Third project')).status, 303);
    const afterRestart = rows(await (await fetch(server.baseUrl)).text());
    assert.equal(afterRestart.length, 3);
    assert.deepEqual(afterRestart.slice(0, 2), projectRows);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
