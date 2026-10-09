import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const repository = fileURLToPath(new URL('../', import.meta.url));

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: repository,
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const address = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${stderr}`));
    }, 5000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${stderr}`));
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
    address,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const [code] = await exited;
      assert.equal(code, 0, stderr);
    },
  };
}

test('projects validate, render safely, navigate, and persist across restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const databasePath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await startServer(databasePath);
    const get = (path) => fetch(`${server.address}${path}`);
    const create = (name) => fetch(`${server.address}/`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });

    const health = await get('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const initial = await (await get('/')).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, /<button type="submit">Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const blank of ['', ' \t\n ']) {
      const response = await create(blank);
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert"[^>]*>Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    const first = await create('  First project  ');
    assert.equal(first.status, 303);
    assert.equal(first.headers.get('location'), '/');
    assert.equal((await create('<script>alert("hello")</script> & second')).status, 303);
    const list = await (await get('/')).text();
    assert.equal((list.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(list, /<span class="project-name">First project<\/span>/);
    assert.match(list, /&lt;script&gt;alert\(&quot;hello&quot;\)&lt;\/script&gt; &amp; second/);
    assert.doesNotMatch(list, /<script>/);
    assert.ok(list.indexOf('First project') < list.indexOf('&lt;script&gt;'));
    const paths = [...list.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.notEqual(paths[0], paths[1]);
    const opened = await get(paths[0]);
    assert.equal(opened.status, 200);
    const projectHtml = await opened.text();
    assert.match(projectHtml, /<h1>First project<\/h1>/);
    assert.match(projectHtml, /<form action="\/" method="get"><button type="submit">Projects<\/button>/);

    const blankWithProjects = await create('   ');
    assert.equal(((await blankWithProjects.text()).match(/data-testid="project-row"/g) || []).length, 2);
    assert.equal((await get('/projects/999999')).status, 404);

    await server.stop();
    server = await startServer(databasePath);
    const restored = await (await get('/')).text();
    assert.equal(restored, list);
    assert.match(await (await get(paths[0])).text(), /<h1>First project<\/h1>/);
    assert.equal((await create('Third project')).status, 303);
    assert.equal(((await (await get('/')).text()).match(/data-testid="project-row"/g) || []).length, 3);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, remain project-owned, filter, and persist completion across restarts', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const databasePath = join(directory, 'workboard.sqlite');
  // Start from the previous schema to verify existing project data survives migration.
  const legacyDatabase = new DatabaseSync(databasePath);
  legacyDatabase.exec(`
    CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    INSERT INTO projects (name) VALUES ('First project'), ('Second project');
  `);
  legacyDatabase.close();
  let server;
  try {
    server = await startServer(databasePath);
    const getHtml = async (path) => (await fetch(`${server.address}${path}`)).text();
    const post = (path, fields) => fetch(`${server.address}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const rowCount = (html) => (html.match(/data-testid="task-row"/g) || []).length;
    const initial = await getHtml('/projects/1');
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /<button type="submit">Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<script src="\/project.js" defer><\/script>/);
    const scriptResponse = await fetch(`${server.address}/project.js`);
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get('content-type'), /text\/javascript/);
    assert.match(await scriptResponse.text(), /keepalive: true/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.equal(rowCount(initial), 0);

    for (const title of ['', ' \t\n ']) {
      const response = await post('/projects/1/tasks', { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert"[^>]*>Task title is required/);
      assert.equal(rowCount(html), 0);
    }
    assert.equal((await post('/projects/1/tasks', { title: '  First task  ' })).status, 303);
    assert.equal((await post('/projects/1/tasks', { title: '<img src=x> & "second"' })).status, 303);
    assert.equal((await post('/projects/2/tasks', { title: 'Other project task' })).status, 303);
    const created = await getHtml('/projects/1');
    assert.equal(rowCount(created), 2);
    assert.match(created, /aria-label="Complete First task"/);
    assert.match(created, /aria-label="Complete &lt;img src=x&gt; &amp; &quot;second&quot;"/);
    assert.doesNotMatch(created, /<img src=x>|Other project task| checked/);
    assert.ok(created.indexOf('First task') < created.indexOf('&lt;img src=x&gt;'));
    assert.equal(rowCount(await getHtml('/projects/1?filter=Open')), 2);
    assert.equal(rowCount(await getHtml('/projects/1?filter=Completed')), 0);
    const taskPaths = [...created.matchAll(/action="(\/projects\/1\/tasks\/\d+)"/g)].map((match) => match[1]);
    assert.equal(taskPaths.length, 2);

    const completedResponse = await post(taskPaths[0], { completed: '1', filter: 'Open' });
    assert.equal(completedResponse.status, 303);
    assert.equal(completedResponse.headers.get('location'), '/projects/1?filter=Open');
    const completed = await getHtml('/projects/1?filter=Completed');
    assert.equal(rowCount(completed), 1);
    assert.match(completed, /aria-label="Complete First task" checked/);
    assert.match(completed, /<option selected>Completed<\/option>/);
    const open = await getHtml('/projects/1?filter=Open');
    assert.equal(rowCount(open), 1);
    assert.doesNotMatch(open, /First task/);
    assert.equal(rowCount(await getHtml('/projects/1?filter=unknown')), 2);
    assert.equal((await post(taskPaths[0].replace('/projects/1/', '/projects/2/'), {})).status, 404);
    assert.equal((await post(taskPaths[0], { completed: 'invalid' })).status, 400);
    assert.equal((await post('/projects/999/tasks', { title: 'Missing project' })).status, 404);
    const otherProject = await getHtml('/projects/2');
    assert.equal(rowCount(otherProject), 1);
    assert.doesNotMatch(otherProject, /First task|&lt;img/);
    const invalidWithTasks = await post('/projects/1/tasks', { title: '  ' });
    assert.equal(rowCount(await invalidWithTasks.text()), 2);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await getHtml('/projects/1?filter=Completed'), completed);
    assert.equal(await getHtml('/projects/1?filter=Open'), open);
    assert.equal(await getHtml('/projects/2'), otherProject);
    assert.equal((await post(taskPaths[0], {})).status, 303);
    assert.equal(rowCount(await getHtml('/projects/1?filter=Completed')), 0);
    assert.equal(await getHtml('/projects/1'), created);

    await server.stop();
    server = await startServer(databasePath);
    assert.equal(await getHtml('/projects/1'), created);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
