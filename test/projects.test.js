import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  };
}

test('tasks validate, filter, stay project-scoped, and persist completion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-tasks-'));
  const dbPath = join(directory, 'workboard.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const request = (path, options) => fetch(server.url + path, options);
    const post = (path, fields) => request(path, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual'
    });
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    const projects = await (await request('/')).text();
    const paths = [...projects.matchAll(/action="(\/projects\/[^" ]+)"/g)].map(match => match[1]);
    const detail = () => request(paths[0]).then(response => response.text());
    assert.match(await detail(), /<label for="task-title">Task title<\/label>/);
    assert.match(await detail(), /<option selected>All<\/option>/);
    for (const title of ['', '  \t ']) {
      const response = await post(`${paths[0]}/tasks`, { title });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.match(html, /role="alert">Task title is required/);
      assert.doesNotMatch(html, /data-testid="task-row"/);
    }
    assert.equal((await post(`${paths[0]}/tasks`, { title: '  First <task>  ' })).status, 303);
    await post(`${paths[0]}/tasks`, { title: 'Second task' });
    let html = await detail();
    assert.equal((html.match(/data-testid="task-row"/g) || []).length, 2);
    assert.ok(html.indexOf('<span>First &lt;task&gt;</span>') < html.indexOf('<span>Second task</span>'));
    assert.match(html, /aria-label="Complete First &lt;task&gt;"/);
    assert.doesNotMatch(html, / checked/);
    const taskPath = html.match(/action="([^" ]+\/tasks\/[^" ]+)"/)[1];
    assert.equal((await post(taskPath, { completed: '1' })).status, 303);
    html = await detail();
    assert.match(html, /aria-label="Complete First &lt;task&gt;" checked/);
    const open = await (await request(`${paths[0]}?filter=Open`)).text();
    assert.doesNotMatch(open, /<span>First/);
    assert.match(open, /<span>Second task/);
    const completed = await (await request(`${paths[0]}?filter=Completed`)).text();
    assert.match(completed, /<span>First/);
    assert.doesNotMatch(completed, /<span>Second/);
    assert.doesNotMatch(await (await request(paths[1])).text(), /data-testid="task-row"/);
    const wrongProjectTask = taskPath.replace(paths[0], paths[1]);
    assert.equal((await post(wrongProjectTask, {})).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await detail(), html);
    assert.equal((await post(taskPath, {})).status, 303);
    assert.doesNotMatch(await detail(), / checked/);
    await server.stop();
    server = await start(dbPath);
    assert.doesNotMatch(await detail(), / checked/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('projects validate, trim, navigate, order and persist across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  const dbPath = join(directory, 'nested', 'projects.sqlite');
  let server;
  try {
    server = await start(dbPath);
    const request = (path, options) => fetch(server.url + path, options);
    const create = name => request('/projects', {
      method: 'POST', body: new URLSearchParams({ name }), redirect: 'manual'
    });
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    let html = await (await request('/')).text();
    assert.match(html, /<h1>Workboard<\/h1>/);
    assert.match(html, /<label for="project-name">Project name<\/label>/);
    assert.match(html, />Create project<\/button>/);
    assert.doesNotMatch(html, /data-testid="project-row"/);
    for (const name of ['', '   \t ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      html = await response.text();
      assert.match(html, /role="alert">Project name is required/);
      assert.doesNotMatch(html, /data-testid="project-row"/);
    }
    assert.equal((await create('  First project  ')).status, 303);
    assert.equal((await create('Second <project>')).status, 303);
    html = await (await request('/')).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.match(html, /<span>First project<\/span>/);
    assert.match(html, /Second &lt;project&gt;/);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    const paths = [...html.matchAll(/action="(\/projects\/[^" ]+)"/g)].map(match => match[1]);
    const detail = await (await request(paths[0])).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/" method="get"><button type="submit">Projects/);
    assert.equal((await request('/projects/missing')).status, 404);
    await server.stop();
    server = await start(dbPath);
    assert.equal(await (await request('/')).text(), html);
    assert.match(await (await request(paths[0])).text(), /<h1>First project<\/h1>/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
