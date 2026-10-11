import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('directory intersects read-only filters, preserves order and literal fields across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-'));
  const databasePath = join(directory, 'workboard.sqlite');
  let server;
  const snapshot = () => {
    const database = new DatabaseSync(databasePath);
    try {
      return ['projects', 'tasks', 'task_project_positions', 'sqlite_sequence'].map((table) =>
        database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    } finally { database.close(); }
  };
  try {
    server = await startServer(databasePath);
    const get = async (path) => (await fetch(`${server.url}${path}`)).text();
    const post = (path, values = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const checkedPost = async (path, values) => assert.equal((await post(path, values)).status, 303);
    const titles = (html) => [...html.matchAll(/data-testid="directory-task-title">(.*?)<\/div>/g)].map((match) => match[1]);
    const path = (state) => `/directory?${new URLSearchParams(state)}`;
    for (const name of ['First owner', 'Second owner', 'Archived owner']) await checkedPost('/projects', { name });
    for (const [project, title] of [[1, 'Plan \t  Release'], [1, 'Other'], [1, 'PLAN release deleted'], [2, 'Plan release second'], [3, 'Plan release archived']]) {
      await checkedPost(`/projects/${project}/tasks`, { title });
    }
    await checkedPost('/projects/1/tasks/1', { completed: '1' });
    for (const [project, id] of [[1, 1], [1, 3], [2, 4], [3, 5]]) {
      await checkedPost(`/projects/${project}/tasks/${id}/priority`, { priority: 'High' });
      await checkedPost(`/projects/${project}/tasks/${id}/due-date`, { dueDate: '2028-02-29' });
    }
    const notes = ' \n日本語 📝 <script>&literal</script>\n\t ';
    await checkedPost('/projects/1/tasks/1/notes', { notes });
    await checkedPost('/projects/1/tasks/2/notes', { notes: 'NotesOnlyMatch' });
    await checkedPost('/projects/1/tasks/1/move', { destination: '2' });
    await checkedPost('/projects/2/tasks/1/move', { destination: '1' });
    await checkedPost('/projects/1/tasks/3/delete');
    await checkedPost('/projects/3/archive');
    const portable = { format: 'workboard-project', version: 1, project: {
      name: 'Copy', archived: false, defaultPriority: 'Low', tasks: [
        { title: 'Imported live', completed: false, priority: 'Low', dueDate: '', notes: '', deleted: false },
        { title: 'Imported deleted', completed: true, priority: 'High', dueDate: '2028-02-29', notes, deleted: true },
      ],
    } };
    await checkedPost('/projects/import', { importedName: 'Imported owner', json: JSON.stringify(portable) });
    const before = snapshot();
    const home = await get('/');
    assert.match(home, /action="\/directory"><button type="submit">Task directory/);
    const initial = await get('/directory');
    assert.deepEqual(titles(initial), ['Plan \t  Release', 'Other', 'Plan release second', 'Imported live']);
    assert.match(initial, /data-testid="directory-project-name">First owner/);
    assert.match(initial, /data-testid="directory-task-completion">Completed/);
    assert.match(initial, /data-testid="directory-task-priority">High/);
    assert.match(initial, /data-testid="directory-task-due-date">2028-02-29/);
    assert.match(initial, /data-testid="directory-task-due-date"><\/div>/);
    assert.ok(initial.includes(`data-testid="directory-task-notes"> \n日本語 📝 &lt;script&gt;&amp;literal&lt;/script&gt;\n\t </div>`));
    assert.match(initial, /\.directory-field \{ white-space: pre-wrap;/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);
    assert.match(initial, /<option selected>All<\/option><option>Open<\/option><option>Completed<\/option><option>Deleted<\/option>/);
    assert.match(initial, /<option selected>All<\/option><option>Low<\/option><option>Normal<\/option><option>High<\/option>/);
    for (const row of initial.matchAll(/data-testid="directory-task-row">([\s\S]*?)<\/form>\s*<\/div>/g)) {
      assert.doesNotMatch(row[1], /<(?:input|textarea|select)\b/);
      assert.match(row[1], /action="\/projects\/\d+"><button type="submit">Open project/);
    }
    assert.match(initial, /action="\/"><button type="submit">Projects/);
    for (const search of ['NotesOnlyMatch', 'First owner', '日本語']) assert.deepEqual(titles(await get(path({ search }))), []);
    const state = { scope: 'Active', filter: 'Completed', priorityFilter: 'High', dueFrom: '2028-02-29', dueThrough: '2028-02-29', search: ' \t pLaN\t  release \n' };
    const filtered = await get(path(state));
    assert.deepEqual(titles(filtered), ['Plan \t  Release']);
    assert.deepEqual(titles(await get(path({ ...state, filter: 'Open' }))), ['Plan release second']);
    assert.deepEqual(titles(await get(path({ ...state, filter: 'Deleted' }))), ['PLAN release deleted']);
    assert.deepEqual(titles(await get(path({ ...state, filter: 'Deleted', search: '' }))), ['PLAN release deleted', 'Imported deleted']);
    assert.deepEqual(titles(await get(path({ ...state, scope: 'Archived', filter: 'All' }))), ['Plan release archived']);
    assert.deepEqual(titles(await get(path({ ...state, dueFrom: '2028-03-01', dueThrough: '' }))), []);
    // Applied values are carried independently of draft range inputs.
    for (const form of filtered.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)) {
      if (!form[0].includes('/directory')) continue;
      assert.match(form[0], /name="dueFrom" value="2028-02-29"/);
      assert.match(form[0], /name="dueThrough" value="2028-02-29"/);
      assert.match(form[0], /name="search"[^>]*value="pLaN\t  release"/);
    }
    for (const [from, through, message] of [
      ['2027-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2028-03-01', '2028-02-29', 'Due from must not be after Due through'],
    ]) {
      const response = await post('/directory/due-range', { ...state, rangeFrom: from, rangeThrough: through });
      assert.equal(response.status, 400);
      const html = await response.text();
      assert.ok(html.includes(`role="alert">${message}`));
      assert.deepEqual(titles(html), ['Plan \t  Release']);
      assert.ok(html.includes(`name="rangeFrom" type="text" value="${from}"`));
    }
    const applied = await post('/directory/due-range', { ...state, rangeFrom: ' 2028-02-29 ', rangeThrough: '' });
    assert.equal(applied.status, 303);
    const location = applied.headers.get('location');
    assert.equal(new URL(location, server.url).searchParams.get('dueThrough'), '');
    assert.deepEqual(titles(await get(location)), ['Plan \t  Release']);
    assert.equal((await post('/directory')).status, 404);
    assert.deepEqual(snapshot(), before);
    assert.equal(await get('/directory'), initial);
    assert.match(await get('/projects/3'), /Archived project/);
    assert.match(await get('/projects/1'), /id="task-search"[^>]*value=""/);
    await server.stop();
    server = undefined;
    server = await startServer(databasePath);
    assert.equal(await get('/directory'), initial);
    assert.equal(await get(path(state)), filtered);
    assert.deepEqual(snapshot(), before);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

async function startServer(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out: ${errors}`));
    }, 5000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
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

