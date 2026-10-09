import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { runInNewContext } from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

async function unusedPort() {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

test('projects validate, preserve order, open and persist across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  // Start from the Task 001 schema to verify a non-destructive upgrade.
  const oldDatabase = new DatabaseSync(join(directory, 'projects.sqlite'));
  oldDatabase.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  oldDatabase.close();
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${errors}`);
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    throw new Error(`Server did not start: ${errors}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
  }
  async function create(name) {
    return fetch(`${base}/projects`, {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual',
    });
  }
  try {
    await start();
    let content = await (await fetch(base)).text();
    assert.match(content, /<h1>Workboard<\/h1>/);
    assert.match(content, /Project name<input/);
    assert.match(content, />Create project<\/button>/);
    assert.match(content, /Project filter/);
    assert.match(content, /<option value="active" selected>Active/);
    assert.match(content, /<option value="archived">Archived/);
    assert.doesNotMatch(content, /data-testid="project-row"/);
    for (const name of ['', '   ']) {
      content = await (await create(name)).text();
      assert.match(content, /role="alert">Project name is required/);
      assert.doesNotMatch(content, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    content = await (await fetch(base)).text();
    assert.equal((content.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(content, /<span>First project<\/span>/);
    assert.ok(content.indexOf('First project') < content.indexOf('Second &lt;project&gt;'));
    const paths = [...content.matchAll(/action="(\/projects\/\d+)"/g)].map(match => match[1]);
    assert.equal(paths.length, 2);
    assert.equal((content.match(/data-testid="project-summary">0\/0 completed/g) || []).length, 2);
    assert.equal((content.match(/>Archive project<\/button>/g) || []).length, 2);
    let detail = await (await fetch(base + paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);
    assert.equal((await fetch(`${base}/projects/9999`)).status, 404);
    const projectPath = paths[0];
    async function postTask(path, values) {
      return fetch(base + path, {
        method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
      });
    }
    const taskRows = html => [...html.matchAll(/<li data-testid="task-row">([\s\S]*?)<\/li>/g)].map(match => match[1]);
    assert.match(detail, /Task title<input/);
    assert.match(detail, /<option value="all" selected>All/);
    for (const title of ['', '   ']) {
      const invalid = await (await postTask(`${projectPath}/tasks`, { title })).text();
      assert.match(invalid, /role="alert">Task title is required/);
      assert.equal(taskRows(invalid).length, 0);
    }
    assert.equal((await postTask(`${projectPath}/tasks`, { title: '  First task  ' })).status, 303);
    assert.equal((await postTask(`${projectPath}/tasks`, { title: 'Second <task>' })).status, 303);
    detail = await (await fetch(base + projectPath)).text();
    let rows = taskRows(detail);
    assert.equal(rows.length, 2);
    assert.match(rows[0], /<span>First task<\/span>/);
    assert.match(rows[0], /aria-label="Complete First task"/);
    assert.match(rows[1], /Second &lt;task&gt;/);
    assert.ok(rows.every(row => !row.includes(' checked')));
    const taskPath = rows[0].match(/action="([^"]+)"/)[1];
    assert.equal((await postTask(taskPath, { completed: '1' })).status, 303);
    rows = taskRows(await (await fetch(`${base}${projectPath}?filter=completed`)).text());
    assert.equal(rows.length, 1);
    assert.match(rows[0], / checked/);
    assert.match(rows[0], /First task/);
    rows = taskRows(await (await fetch(`${base}${projectPath}?filter=open`)).text());
    assert.equal(rows.length, 1);
    assert.match(rows[0], /Second &lt;task&gt;/);
    assert.equal(taskRows(await (await fetch(base + paths[1])).text()).length, 0);
    const foreignTaskPath = taskPath.replace(projectPath, paths[1]);
    assert.equal((await postTask(foreignTaskPath, {})).status, 404);
    detail = await (await fetch(base + projectPath)).text();
    content = await (await fetch(base)).text();
    assert.match(content, /data-testid="project-summary">1\/2 completed/);
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), content);
    assert.equal(await (await fetch(base + paths[0])).text(), detail);
    assert.equal((await postTask(taskPath, {})).status, 303);
    rows = taskRows(await (await fetch(base + projectPath)).text());
    assert.ok(rows.every(row => !row.includes(' checked')));
    assert.equal(taskRows(await (await fetch(`${base}${projectPath}?filter=completed`)).text()).length, 0);

    // Exercise the browser change handler, including the immediate-reload case.
    const script = detail.match(/<script>([\s\S]*?)<\/script>/)[1];
    for (const completed of [true, false]) {
      let savedRequest;
      const error = { hidden: true };
      const checkbox = {
        checked: completed,
        form: { action: base + taskPath, elements: { filter: { value: 'all' } } },
      };
      const context = {
        document: { getElementById: () => error },
        URLSearchParams,
        FormData: class {
          constructor() {
            return completed ? [['filter', 'all'], ['completed', '1']] : [['filter', 'all']];
          }
        },
        XMLHttpRequest: class {
          open(method, url, asynchronous) {
            assert.equal(asynchronous, false, 'save must finish before change returns');
            savedRequest = { method, url, headers: {} };
          }
          setRequestHeader(name, value) { savedRequest.headers[name] = value; }
          send(body) { savedRequest.body = body; this.status = 204; }
        },
      };
      runInNewContext(script, context);
      context.saveCompletion(checkbox);
      assert.equal(error.hidden, true);
      const { url, ...options } = savedRequest;
      assert.equal((await fetch(url, options)).status, 204);
      const reloaded = taskRows(await (await fetch(base + projectPath)).text());
      assert.equal(reloaded[0].includes(' checked'), completed);
      await stop();
      await start();
      assert.equal(taskRows(await (await fetch(base + projectPath)).text())[0].includes(' checked'), completed);
    }

    await postTask(taskPath, { completed: '1' });
    assert.equal((await postTask(`${projectPath}/archive`, {})).status, 303);
    content = await (await fetch(base)).text();
    assert.doesNotMatch(content, /First project/);
    assert.match(content, /Second &lt;project&gt;/);
    const archivedList = await (await fetch(`${base}/?filter=archived`)).text();
    assert.match(archivedList, /<option value="archived" selected>Archived/);
    assert.match(archivedList, /First project/);
    assert.doesNotMatch(archivedList, /Second &lt;project&gt;/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    detail = await (await fetch(base + projectPath)).text();
    assert.match(detail, /Archived project/);
    assert.match(detail, /<button type="submit" disabled>Create task/);
    rows = taskRows(detail);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => /aria-label="Complete [^"]+"[^>]* disabled/.test(row)));
    assert.equal(taskRows(await (await fetch(`${base}${projectPath}?filter=open`)).text()).length, 1);
    assert.equal(taskRows(await (await fetch(`${base}${projectPath}?filter=completed`)).text()).length, 1);
    assert.equal((await postTask(`${projectPath}/tasks`, { title: 'Blocked task' })).status, 403);
    assert.equal((await postTask(taskPath, {})).status, 403);
    await stop();
    await start();
    assert.equal(await (await fetch(`${base}/?filter=archived`)).text(), archivedList);
    assert.equal(await (await fetch(base + projectPath)).text(), detail);
    assert.equal((await postTask(`${projectPath}/restore`, {})).status, 303);
    content = await (await fetch(base)).text();
    assert.ok(content.indexOf('First project') < content.indexOf('Second &lt;project&gt;'));
    assert.match(content, /data-testid="project-summary">1\/2 completed/);
    assert.doesNotMatch(await (await fetch(`${base}/?filter=archived`)).text(), /data-testid="project-row"/);
    detail = await (await fetch(base + projectPath)).text();
    assert.doesNotMatch(detail, /Archived project/);
    rows = taskRows(detail);
    assert.equal(rows.length, 2);
    assert.match(rows[0], / checked/);
    assert.ok(rows.every(row => !row.includes(' disabled')));
    await stop();
    await start();
    assert.equal(await (await fetch(base)).text(), content);
    assert.equal(await (await fetch(base + projectPath)).text(), detail);
    assert.equal((await postTask(taskPath, {})).status, 303);
    assert.equal((await postTask(`${projectPath}/tasks`, { title: 'Restored task' })).status, 303);
    assert.match(await (await fetch(base)).text(), /data-testid="project-summary">0\/3 completed/);
    assert.equal((await postTask('/projects/9999/archive', {})).status, 404);
    assert.equal((await postTask('/projects/9999/restore', {})).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
