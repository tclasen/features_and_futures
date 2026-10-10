import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runInNewContext } from 'node:vm';

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: resolve('.'),
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const baseUrl = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /http:\/\/0\.0\.0\.0:(\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolveUrl(`http://127.0.0.1:${match[1]}`);
      }
    });
  });
  return {
    baseUrl,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const [code] = await exited;
      assert.equal(code, 0, errors);
    },
  };
}

test('projects validate, render safely, retain creation order, and survive restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-'));
  let server;
  try {
    const databasePath = join(directory, 'projects.sqlite');
    server = await startServer(databasePath);
    const get = (path) => fetch(`${server.baseUrl}${path}`);
    const create = (name) => fetch(`${server.baseUrl}/projects`, {
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
    assert.match(initial, /id="project-name" name="name" type="text"/);
    assert.match(initial, />Create project<\/button>/);
    assert.doesNotMatch(initial, /data-testid="project-row"/);

    for (const name of ['', '   \t\n']) {
      const invalid = await create(name);
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }

    for (const name of ['  First project  ', 'Second <script> & café']) {
      const created = await create(name);
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), '/');
      await created.text();
    }
    const listing = await (await get('/')).text();
    assert.equal((listing.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(listing, /<span>First project<\/span>/);
    assert.match(listing, /Second &lt;script&gt; &amp; café/);
    assert.ok(listing.indexOf('First project') < listing.indexOf('Second &lt;'));
    const paths = [...listing.matchAll(/action="(\/projects\/\d+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    assert.equal(new Set(paths).size, 2);
    assert.equal((listing.match(/>Open project<\/button>/g) || []).length, 2);

    const detail = await (await get(paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects<\/button>/);
    const invalidAfterCreation = await create(' ');
    assert.equal(invalidAfterCreation.status, 422);
    assert.equal(((await invalidAfterCreation.text()).match(/data-testid="project-row"/g) || []).length, 2);
    assert.equal(await (await get('/')).text(), listing);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await (await get('/')).text(), listing);
    assert.equal(await (await get(paths[0])).text(), detail);
    assert.match(await (await get(paths[1])).text(), /<h1>Second &lt;script&gt; &amp; café<\/h1>/);
    assert.equal((await get('/projects/99999')).status, 404);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('tasks validate, filter, remain project-owned, and persist completion across restart', async () => {
  await mkdir('data', { recursive: true });
  const directory = await mkdtemp(resolve('data/test-tasks-'));
  let server;
  try {
    const databasePath = join(directory, 'tasks.sqlite');
    server = await startServer(databasePath);
    const getHtml = async (path) => (await fetch(`${server.baseUrl}${path}`)).text();
    const post = (path, fields) => fetch(`${server.baseUrl}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    for (const name of ['Alpha', 'Beta']) {
      assert.equal((await post('/projects', { name })).status, 303);
    }
    const paths = [...(await getHtml('/')).matchAll(/action="(\/projects\/\d+)"/g)]
      .map((match) => match[1]);
    const [alpha, beta] = paths;
    const initial = await getHtml(alpha);
    assert.match(initial, /<label for="task-title">Task title<\/label>/);
    assert.match(initial, /id="task-title" name="title" type="text"/);
    assert.match(initial, />Create task<\/button>/);
    assert.match(initial, /<label for="task-filter">Task filter<\/label>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option>/);
    assert.doesNotMatch(initial, /data-testid="task-row"/);

    for (const title of ['', ' \t\n ']) {
      const invalid = await post(`${alpha}/tasks`, { title });
      assert.equal(invalid.status, 422);
      const html = await invalid.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    for (const title of ['  First task  ', 'Second <script> & "quoted"']) {
      const created = await post(`${alpha}/tasks`, { title });
      assert.equal(created.status, 303);
      assert.equal(created.headers.get('location'), alpha);
    }
    assert.equal((await post(`${beta}/tasks`, { title: 'Beta task' })).status, 303);
    const listing = await getHtml(alpha);
    const rows = (html) => [...html.matchAll(/<li data-testid="task-row"[\s\S]*?<\/li>/g)]
      .map((match) => match[0]);
    assert.equal(rows(listing).length, 2);
    assert.match(listing, /<span>First task<\/span>/);
    assert.match(listing, /aria-label="Complete First task"/);
    assert.match(listing, /aria-label="Complete Second &lt;script&gt; &amp; &quot;quoted&quot;"/);
    assert.ok(listing.indexOf('First task') < listing.indexOf('Second &lt;'));
    assert.doesNotMatch(rows(listing).join(''), / checked/);
    assert.doesNotMatch(await getHtml(beta), /First task|Second &lt;/);
    assert.doesNotMatch(listing, /Beta task/);

    // Exercise the rendered change handler shared by checkboxes and the filter.
    const handlers = [];
    let submissions = 0;
    const controls = [0, 1, 2].map(() => ({
      form: { requestSubmit() { submissions++; } },
      addEventListener(event, handler) {
        assert.equal(event, 'change');
        handlers.push(handler);
      },
    }));
    runInNewContext(listing.match(/<script>([\s\S]*?)<\/script>/)[1], {
      document: { querySelectorAll(selector) {
        assert.equal(selector, '[data-submit-on-change]');
        return controls;
      } },
    });
    handlers.forEach((handler) => handler());
    assert.equal(submissions, 3);

    const taskPaths = [...listing.matchAll(/action="(\/projects\/\d+\/tasks\/\d+)"/g)]
      .map((match) => match[1]);
    const completed = await post(taskPaths[0], { completed: '1', filter: 'Open' });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get('location'), `${alpha}?filter=Open`);
    const all = await getHtml(alpha);
    assert.match(rows(all)[0], / checked/);
    assert.doesNotMatch(rows(all)[1], / checked/);
    const open = await getHtml(`${alpha}?filter=Open`);
    assert.equal(rows(open).length, 1);
    assert.match(rows(open)[0], /Second &lt;/);
    const done = await getHtml(`${alpha}?filter=Completed`);
    assert.equal(rows(done).length, 1);
    assert.match(rows(done)[0], /First task/);
    assert.match(done, /<option selected>Completed<\/option>/);

    const invalid = await post(`${alpha}/tasks`, { title: ' ' });
    assert.equal(invalid.status, 422);
    assert.equal(rows(await invalid.text()).length, 2);
    assert.equal(await getHtml(alpha), all);
    const foreignPath = taskPaths[0].replace(alpha, beta);
    assert.equal((await post(foreignPath, {})).status, 404);
    assert.equal(await getHtml(alpha), all);
    assert.equal((await post('/projects/99999/tasks', { title: 'Orphan' })).status, 404);

    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await getHtml(alpha), all);
    assert.equal(await getHtml(`${alpha}?filter=Open`), open);
    assert.equal(await getHtml(`${alpha}?filter=Completed`), done);
    assert.match(await getHtml(beta), /Beta task/);
    assert.equal((await post(taskPaths[0], {})).status, 303);
    assert.doesNotMatch(rows(await getHtml(alpha)).join(''), / checked/);
    assert.equal(rows(await getHtml(`${alpha}?filter=Completed`)).length, 0);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.doesNotMatch(rows(await getHtml(alpha)).join(''), / checked/);
    assert.equal(rows(await getHtml(`${alpha}?filter=Open`)).length, 2);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
