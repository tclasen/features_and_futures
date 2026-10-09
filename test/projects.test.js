import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';

test('HTTP contract, validation, project order, and restart persistence', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.test-db-'));
  const reservation = createServer();
  reservation.listen(0, '0.0.0.0');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';
  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'nested', 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const response = await fetch(`${base}/health`);
        if (response.ok) return;
      } catch {}
      await delay(25);
    }
    throw new Error(`Server did not start: ${output}`);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  const getProjects = async () => (await fetch(`${base}/api/projects`)).json();
  const create = name => fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  try {
    await start();
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.deepEqual(await getProjects(), []);
    for (const name of ['', ' \t\n ']) {
      const response = await create(name);
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /Project name is required/);
    }
    assert.deepEqual(await getProjects(), []);
    const firstResponse = await create('  First project  ');
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    assert.equal(first.name, 'First project');
    const second = await (await create('<script>Second</script>')).json();
    assert.notEqual(first.id, second.id);
    assert.deepEqual(await getProjects(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
    for (const path of ['/', `/projects/${first.id}`]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /<label for="project-name">Project name<\/label>/);
    }
    assert.equal((await fetch(`${base}/app.js`)).status, 200);
    assert.equal((await fetch(`${base}/api/projects/999999`)).status, 404);
    await stop();
    await start();
    assert.deepEqual(await getProjects(), [first, second]);
    assert.deepEqual(await (await fetch(`${base}/api/projects/${first.id}`)).json(), first);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test('UI handlers validate, create rows, open projects, and return to the list', async () => {
  class Element {
    constructor() { this.hidden = false; this.textContent = ''; this.value = ''; this.dataset = {}; this.children = []; this.handlers = {}; }
    addEventListener(event, handler) { this.handlers[event] = handler; }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    querySelector() { return submit; }
  }
  const submit = new Element();
  const elements = Object.fromEntries([
    '#projects-view', '#project-view', '#project-list', '#project-form',
    '#project-name', '#project-alert', '#detail-alert', '#project-heading', '#back-button',
  ].map(id => [id, new Element()]));
  const projects = [];
  const location = { pathname: '/' };
  const document = { querySelector: id => elements[id], createElement: () => new Element() };
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document, location,
    history: { pushState: (_state, _title, path) => { location.pathname = path; } },
    window: { addEventListener() {} },
    fetch: async (path, options) => {
      if (options) projects.push({ id: projects.length + 1, ...JSON.parse(options.body) });
      const body = path === '/api/projects' ? projects : projects.find(project => path === `/api/projects/${project.id}`);
      return { ok: true, json: async () => body };
    },
  });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush();
  const submitForm = () => elements['#project-form'].handlers.submit({ preventDefault() {} });
  elements['#project-name'].value = '   ';
  await submitForm();
  assert.equal(elements['#project-alert'].hidden, false);
  assert.equal(elements['#project-alert'].textContent, 'Project name is required');
  assert.equal(elements['#project-list'].children.length, 0);
  elements['#project-name'].value = '  My project  ';
  await submitForm();
  const row = elements['#project-list'].children[0];
  assert.equal(row.dataset.testid, 'project-row');
  assert.equal(row.children[0].textContent, 'My project');
  assert.equal(row.children[1].textContent, 'Open project');
  row.children[1].handlers.click();
  await flush();
  assert.equal(location.pathname, '/projects/1');
  assert.equal(elements['#project-heading'].textContent, 'My project');
  assert.equal(elements['#projects-view'].hidden, true);
  elements['#back-button'].handlers.click();
  await flush();
  assert.equal(location.pathname, '/');
  assert.equal(elements['#projects-view'].hidden, false);
  assert.equal(elements['#project-list'].children.length, 1);
});
