import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start: ${stderr}`));
    }, 5000);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /listening on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited (${code}): ${stderr}`));
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

async function createProject(url, name) {
  return fetch(`${url}/projects`, {
    method: 'POST',
    body: new URLSearchParams({ name }),
    redirect: 'manual',
  });
}

function rows(html) {
  return [...html.matchAll(/<li data-testid="project-row">([\s\S]*?)<\/li>/g)]
    .map((match) => ({
      name: /<span>(.*?)<\/span>/.exec(match[1])[1],
      path: /action="([^"]+)"/.exec(match[1])[1],
    }));
}

function taskRows(html) {
  return [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)]
    .map((match) => ({
      title: /<span>(.*?)<\/span>/.exec(match[1])[1],
      action: /action="([^"]+)"/.exec(match[1])[1],
      completed: / checked/.test(match[1]),
    }));
}

async function post(url, path, fields) {
  return fetch(`${url}${path}`, {
    method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
  });
}

test('tasks validate, filter, remain isolated, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let app;
  try {
    app = await start(databasePath);
    await createProject(app.url, 'First');
    await createProject(app.url, 'Second');
    const [first, second] = rows(await (await fetch(app.url)).text());
    const detail = async (path = first.path) => (await fetch(`${app.url}${path}`)).text();
    const initial = await detail();
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    for (const title of ['', ' \t\n ']) {
      const invalid = await post(app.url, `${first.path}/tasks`, { title });
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.deepEqual(taskRows(html), []);
    }
    for (const title of ['  Plan  ', '<b>Build</b> & ship']) {
      const created = await post(app.url, `${first.path}/tasks`, { title });
      assert.equal(created.status, 303);
    }
    const tasks = taskRows(await detail());
    assert.deepEqual(tasks.map((task) => task.title), ['Plan', '&lt;b&gt;Build&lt;/b&gt; &amp; ship']);
    assert.ok(tasks.every((task) => !task.completed));
    assert.match(await detail(), /aria-label="Complete Plan"/);
    assert.deepEqual(taskRows(await detail(second.path)), []);
    assert.equal((await post(app.url, tasks[0].action.replace(first.path, second.path), { completed: '1' })).status, 404);
    assert.equal((await post(app.url, '/projects/99999/tasks', { title: 'No' })).status, 404);
    const completed = await post(app.url, tasks[0].action, { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), `${first.path}?filter=Open`);
    assert.deepEqual(taskRows(await detail(`${first.path}?filter=Open`)).map((task) => task.title), [tasks[1].title]);
    assert.deepEqual(taskRows(await detail(`${first.path}?filter=Completed`)).map((task) => task.title), ['Plan']);
    const saved = taskRows(await detail());
    assert.equal(saved[0].completed, true);
    assert.equal(saved[1].completed, false);
    assert.deepEqual(taskRows(await detail(`${first.path}?filter=invalid`)), saved);
    const invalid = await post(app.url, `${first.path}/tasks`, { title: '   ' });
    assert.deepEqual(taskRows(await invalid.text()), saved);
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(taskRows(await detail()), saved);
    assert.deepEqual(taskRows(await detail(second.path)), []);
    assert.equal((await post(app.url, tasks[0].action, {})).status, 303);
    assert.deepEqual(taskRows(await detail(`${first.path}?filter=Completed`)), []);
    await app.stop();
    app = await start(databasePath);
    assert.ok(taskRows(await detail()).every((task) => !task.completed));
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, navigate, escape HTML, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let app;
  try {
    app = await start(databasePath);
    const health = await fetch(`${app.url}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const initial = await (await fetch(app.url)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.deepEqual(rows(initial), []);

    for (const name of ['', ' \t\n ']) {
      const invalid = await createProject(app.url, name);
      assert.equal(invalid.status, 400);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.deepEqual(rows(html), []);
    }

    for (const name of ['  First project  ', '<script>alert("x")</script> & Second']) {
      const response = await createProject(app.url, name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const savedRows = rows(await (await fetch(app.url)).text());
    assert.deepEqual(savedRows.map((row) => row.name), [
      'First project', '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Second',
    ]);
    assert.notEqual(savedRows[0].path, savedRows[1].path);
    const detail = await (await fetch(`${app.url}${savedRows[0].path}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /<form action="\/" method="get"><button type="submit">Projects<\/button>/);
    assert.equal((await fetch(`${app.url}/projects/99999`)).status, 404);

    const invalid = await createProject(app.url, '   ');
    assert.deepEqual(rows(await invalid.text()), savedRows);
    await app.stop();
    app = await start(databasePath);
    assert.deepEqual(rows(await (await fetch(app.url)).text()), savedRows);
    const persistedDetail = await fetch(`${app.url}${savedRows[0].path}`);
    assert.equal(persistedDetail.status, 200);
    assert.match(await persistedDetail.text(), /<h1>First project<\/h1>/);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
