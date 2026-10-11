import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(dbPath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe']
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited: ${code}`)));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill(); await exited; }
  };
}

const task = (title, overrides = {}) => ({ title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false, ...overrides });
const document = () => ({ format: 'workboard-project', version: 1, project: {
  name: 'Original', archived: false, defaultPriority: 'Low', tasks: [
    task('  First  雪 <tag>  ', { completed: true, priority: 'High', dueDate: '0001-01-01', notes: '  <script>literal</script>\r\n雪\rEnd  ' }),
    task('Deleted', { deleted: true, completed: true, priority: 'Low', dueDate: '2000-02-29' }),
    task('Last')
  ] } });

test('imports validate atomically, preserve independent state and remembered order across restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-import-'));
  const dbPath = join(directory, 'db.sqlite');
  let server;
  let db;
  try {
    server = await start(dbPath);
    db = new DatabaseSync(dbPath);
    const get = path => fetch(server.url + path);
    const post = (path, values = {}) => fetch(server.url + path, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual'
    });
    const imported = (json, name = ' Copy ') => post('/projects/import', { projectJson: json, importedName: name });
    const exported = async id => (await get(`/projects/${id}/export`)).json();
    const snapshot = () => ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    await post('/projects', { name: 'Existing' });
    await post('/projects/1/tasks', { title: 'Independent' });
    const before = snapshot();
    const home = await (await get('/')).text();
    assert.match(home, /<label for="project-json">Project JSON<\/label>/);
    assert.match(home, /<textarea id="project-json"/);
    assert.match(home, /Imported project name/);
    const invalids = ['{', 'null', '[]'];
    const invalid = mutate => { const value = document(); mutate(value); invalids.push(JSON.stringify(value)); };
    invalid(value => { value.format = 'other'; });
    invalid(value => { value.version = '1'; });
    invalid(value => { value.version = 2; });
    invalid(value => { value.project = []; });
    for (const field of ['name', 'archived', 'defaultPriority', 'tasks']) invalid(value => { delete value.project[field]; });
    invalid(value => { value.project.name = ' \t '; });
    invalid(value => { value.project.archived = 1; });
    invalid(value => { value.project.defaultPriority = 'normal'; });
    invalid(value => { value.project.tasks = {}; });
    for (const field of ['title', 'completed', 'priority', 'dueDate', 'notes', 'deleted']) {
      invalid(value => { delete value.project.tasks[2][field]; });
    }
    for (const [field, values] of Object.entries({
      title: ['', ' \t ', 1], completed: [1, 'false'], priority: ['Urgent', null],
      dueDate: ['1900-02-29', '2023-02-29', '0000-01-01', '10000-01-01', '2024-04-31', '2024-1-01', ' 2024-01-01', null],
      notes: [null, 1], deleted: [0, 'true']
    })) for (const value of values) invalid(doc => { doc.project.tasks[2][field] = value; });
    for (const json of invalids) {
      const response = await imported(json, '  Retain <name>  ');
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /role="alert">Invalid project JSON/);
      assert.match(html, /value="  Retain &lt;name&gt;  "/);
      assert.deepEqual(snapshot(), before);
    }
    const rejected = await (await imported(JSON.stringify(document()), ' \t ')).text();
    assert.match(rejected, /role="alert">Project name is required/);
    assert.match(rejected, /&lt;script&gt;literal&lt;\/script&gt;/);
    assert.deepEqual(snapshot(), before);
    const value = document();
    value.project.id = 1;
    value.project.tasks[0].id = 1;
    value.project.tasks[0].project_id = 1;
    value.project.tasks[0].position = -100;
    const response = await imported(JSON.stringify(value));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/projects/2');
    const expected = document();
    expected.project.name = 'Copy';
    expected.project.tasks[0].notes = expected.project.tasks[0].notes.replace(/\r\n?/g, '\n');
    assert.deepEqual(await exported(2), expected);
    assert.equal((await exported(1)).project.tasks[0].title, 'Independent');
    assert.match(await (await get('/')).text(), /1\/2 completed/);
    await post('/projects/2/default-priority', { priority: 'High' });
    await post('/projects/2/tasks', { title: 'Later' });
    const deletedId = db.prepare("SELECT id FROM tasks WHERE project_id = 2 AND title = 'Deleted'").get().id;
    const deletedPage = await (await get('/projects/2?filter=Deleted')).text();
    assert.match(deletedPage, /Restore task/);
    assert.match(deletedPage, /name="notes" rows="4" disabled/);
    assert.equal((await post(`/projects/2/tasks/${deletedId}/move`, { destination: 1 })).status, 403);
    const restored = await post(`/projects/2/tasks/${deletedId}/restore`, { filter: 'Deleted' });
    assert.match(restored.headers.get('location'), /filter=Deleted/);
    const firstId = db.prepare('SELECT id FROM tasks WHERE project_id = 2 ORDER BY position LIMIT 1').get().id;
    await post(`/projects/2/tasks/${firstId}/move`, { destination: 1 });
    await post(`/projects/1/tasks/${firstId}/move`, { destination: 2 });
    const state = await exported(2);
    assert.deepEqual(state.project.tasks.map(t => t.title), [...expected.project.tasks.map(t => t.title), 'Later']);
    assert.equal(state.project.tasks[1].priority, 'Low');
    assert.equal(state.project.tasks[1].deleted, false);
    const archived = document(); archived.project.archived = true;
    assert.equal((await imported(JSON.stringify(archived), 'Archived copy')).status, 303);
    const archivedPage = await (await get('/projects/3?filter=Deleted')).text();
    assert.match(archivedPage, /Archived project/);
    assert.match(archivedPage, /disabled>Restore task/);
    await post('/projects/3/restore');
    assert.equal((await exported(3)).project.archived, false);
    assert.deepEqual(await exported(2), state);
    const empty = document(); empty.project.tasks = [];
    await imported(JSON.stringify(empty), 'Empty');
    assert.deepEqual((await exported(4)).project.tasks, []);
    db.close(); db = undefined;
    await server.stop(); server = await start(dbPath);
    assert.deepEqual(await exported(2), state);
    assert.deepEqual((await exported(3)).project.tasks, expected.project.tasks);
    assert.deepEqual(await (await get('/health')).json(), { status: 'ok' });
  } finally {
    if (db?.isOpen) db.close();
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
