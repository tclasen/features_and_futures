import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function launch(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Server exited (${code}): ${errors}`));
    });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    base,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    },
  };
}

test('projects validate, render safely, navigate, and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'workboard.sqlite');
  let app;
  try {
    app = await launch(databasePath);
    const health = await fetch(`${app.base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await fetch(app.base)).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);

    const create = name => fetch(`${app.base}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
    for (const name of ['', ' \t\n ']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 400);
      const invalidHtml = await invalid.text();
      assert.match(invalidHtml, /role="alert">Project name is required/);
      assert.doesNotMatch(invalidHtml, /data-testid="project-row"/);
    }
    for (const name of ['  First project  ', '<script>alert("x")</script>']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    html = await (await fetch(app.base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.ok(html.indexOf('First project') < html.indexOf('&lt;script&gt;'));
    const projectPaths = [...html.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(projectPaths.length, 2);
    const detail = await (await fetch(`${app.base}${projectPaths[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/"/);
    assert.match(detail, />Projects<\/button>/);
    assert.equal((await fetch(`${app.base}/projects/999`)).status, 404);

    await app.stop();
    app = undefined;
    app = await launch(databasePath);
    const persisted = await (await fetch(app.base)).text();
    assert.equal(persisted, html);
    const persistedDetail = await fetch(`${app.base}${projectPaths[0]}`);
    assert.equal(persistedDetail.status, 200);
    assert.match(await persistedDetail.text(), /<h1>First project<\/h1>/);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain project-owned, and save completion across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-test-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let app;
  try {
    // Start with the Task 001 schema to verify a compatible database upgrade.
    const existingDatabase = new DatabaseSync(databasePath);
    try {
      existingDatabase.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL CHECK(length(trim(name)) > 0)
        );
        INSERT INTO projects (name) VALUES ('One');
      `);
    } finally {
      existingDatabase.close();
    }
    app = await launch(databasePath);
    const post = (path, values) => fetch(`${app.base}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const getPage = async path => (await fetch(`${app.base}${path}`)).text();
    const rows = html => [...html.matchAll(/<li data-testid="task-row">[\s\S]*?<\/li>/g)].map(match => match[0]);

    await post('/projects', { name: 'Two' });
    let html = await getPage('/projects/1');
    assert.match(html, /<h1>One<\/h1>/);
    assert.match(html, /<label for="task-title">Task title<\/label>/);
    assert.match(html, />Create task<\/button>/);
    assert.match(html, /<label for="task-filter">Task filter<\/label>/);
    assert.match(html, /<option selected>All<\/option>/);
    assert.match(html, /<option>Open<\/option>/);
    assert.match(html, /<option>Completed<\/option>/);
    assert.equal(rows(html).length, 0);

    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.equal(rows(html).length, 0);
    }
    for (const title of ['  First task  ', '<script>"second"</script>']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/projects/1');
    }
    await post('/projects/2/tasks', { title: 'Other project task' });
    html = await getPage('/projects/1');
    const taskRows = rows(html);
    assert.equal(taskRows.length, 2);
    assert.match(taskRows[0], /<span>First task<\/span>/);
    assert.match(taskRows[0], /type="checkbox".*aria-label="Complete First task"/);
    assert.match(taskRows[1], /&lt;script&gt;&quot;second&quot;&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(taskRows.join(''), / checked/);
    assert.doesNotMatch(html, /Other project task/);
    assert.equal(rows(await getPage('/projects/1?filter=Open')).length, 2);
    assert.equal(rows(await getPage('/projects/1?filter=Completed')).length, 0);

    const completionPath = taskRows[0].match(/action="([^"]+\/completion)"/)[1];
    const completed = await post(completionPath, { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), '/projects/1?filter=Open');
    const completedPage = await getPage('/projects/1?filter=Completed');
    assert.equal(rows(completedPage).length, 1);
    assert.match(rows(completedPage)[0], / checked/);
    assert.match(completedPage, /<option selected>Completed<\/option>/);
    const openRows = rows(await getPage('/projects/1?filter=Open'));
    assert.equal(openRows.length, 1);
    assert.match(openRows[0], /second/);
    const invalid = await post('/projects/1/tasks', { title: '   ' });
    assert.equal(rows(await invalid.text()).length, 2);

    const crossProject = await post(completionPath.replace('/projects/1/', '/projects/2/'), {});
    assert.equal(crossProject.status, 404);
    assert.equal((await post('/projects/999/tasks', { title: 'Orphan' })).status, 404);
    assert.equal((await post('/projects/1/tasks/999/completion', {})).status, 404);
    const otherPage = await getPage('/projects/2');
    assert.equal(rows(otherPage).length, 1);
    assert.match(otherPage, /Other project task/);
    assert.doesNotMatch(rows(otherPage)[0], / checked/);
    assert.match(await getPage('/projects/1?filter=invalid'), /<option selected>All<\/option>/);

    const savedPage = await getPage('/projects/1');
    await app.stop();
    app = undefined;
    app = await launch(databasePath);
    assert.equal(await getPage('/projects/1'), savedPage);
    assert.equal(await getPage('/projects/1?filter=Completed'), completedPage);
    assert.equal(await getPage('/projects/2'), otherPage);

    assert.equal((await post(completionPath, {})).status, 303);
    html = await getPage('/projects/1');
    assert.equal(rows(html).length, 2);
    assert.doesNotMatch(rows(html).join(''), / checked/);
    assert.equal(rows(await getPage('/projects/1?filter=Completed')).length, 0);
    await app.stop();
    app = undefined;
    app = await launch(databasePath);
    assert.equal(await getPage('/projects/1'), html);
  } finally {
    if (app) await app.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
