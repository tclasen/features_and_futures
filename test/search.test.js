import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

async function launch(db) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: db }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('error', reject);
    child.once('exit', () => reject(new Error('Server exited')));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; },
  };
}

test('search intersects filters, retains applied queries through edits, and resets on reopening', async () => {
  const directory = await mkdtemp(path.resolve('data/search-test-'));
  let server;
  try {
    server = await launch(path.join(directory, 'db.sqlite'));
    const post = (route, values = {}) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
    });
    const html = async (route) => (await fetch(server.url + route)).text();
    const rows = (markup) => [...markup.matchAll(/aria-label="Complete ([^"]+)"/g)].map((match) => match[1]);
    const projects = (markup) => [...markup.matchAll(/data-testid="project-row">\s*<span>([^<]+)<\/span>/g)].map((match) => match[1]);
    for (const name of ['Alpha  Team', 'alpha Team', 'Other', 'Ä']) await post('/projects', { name });
    assert.deepEqual(projects(await html('/?searchQuery=%20ALPHA%20')), ['Alpha  Team', 'alpha Team']);
    assert.deepEqual(projects(await html('/?searchQuery=alpha%20%20')), ['Alpha  Team', 'alpha Team']);
    assert.deepEqual(projects(await html('/?searchQuery=alpha%20%20t')), ['Alpha  Team']);
    assert.deepEqual(projects(await html('/?searchQuery=ä')), []);
    await post('/projects/2/archive', { projectSearch: 'alpha' });
    assert.deepEqual(projects(await html('/?projectSearch=alpha')), ['Alpha  Team']);
    assert.deepEqual(projects(await html('/?projectSearch=alpha&filter=Archived')), ['alpha Team']);
    assert.match(await html('/?projectSearch=alpha'), /name="projectSearch" value="alpha"/);
    assert.match(await html('/'), /id="project-search" name="searchQuery" type="text" value=""/);

    for (const title of ['Read  Notes', 'READ Notes', 'Other']) await post('/projects/1/tasks', { title });
    for (const id of [1, 2]) {
      await post(`/projects/1/tasks/${id}/priority`, { priority: 'High' });
      await post(`/projects/1/tasks/${id}/due-date`, { dueDate: '2025-04-01' });
    }
    const state = { filter: 'Open', priorityFilter: 'High', rangeFrom: '2025-04-01', rangeThrough: '2025-04-01', taskSearch: 'read' };
    const route = '/projects/1?' + new URLSearchParams(state);
    assert.deepEqual(rows(await html(route)), ['Read  Notes', 'READ Notes']);
    assert.deepEqual(rows(await html('/projects/1?searchQuery=read%20%20n')), ['Read  Notes']);
    assert.match(await html(route), /name="taskSearch" value="read"/);
    let response = await post('/projects/1/tasks/1/rename', { ...state, title: 'No match' });
    assert.deepEqual(rows(await html(response.headers.get('location'))), ['READ Notes']);
    response = await post('/projects/1/tasks/2', { ...state, completed: '1' });
    assert.deepEqual(rows(await html(response.headers.get('location'))), []);
    response = await post('/projects/1/tasks/2', state);
    assert.deepEqual(rows(await html(response.headers.get('location'))), ['READ Notes']);
    response = await post('/projects/1/tasks/2/due-date', { ...state, dueDate: '2025-04-02' });
    assert.deepEqual(rows(await html(response.headers.get('location'))), []);
    await post('/projects/1/tasks/2/due-date', { ...state, dueDate: '2025-04-01' });
    for (const [endpoint, values] of [
      ['rename', { name: 'New project' }], ['default-priority', { priority: 'Low' }],
      ['tasks', { title: 'read undated' }],
    ]) {
      response = await post(`/projects/1/${endpoint}`, { ...state, ...values });
      assert.deepEqual(rows(await html(response.headers.get('location'))), ['READ Notes']);
    }
    const invalid = await (await post('/projects/1/due-range', { ...state, dueFrom: 'bad' })).text();
    assert.deepEqual(rows(invalid), ['READ Notes']);
    assert.match(invalid, /name="taskSearch" value="read"/);
    response = await post('/projects/1/due-range', { ...state, dueFrom: '2025-04-01', dueThrough: '2025-04-01' });
    assert.deepEqual(rows(await html(response.headers.get('location'))), ['READ Notes']);
    await post('/projects/1/tasks/2/move', { ...state, destination: '3' });
    assert.deepEqual(rows(await html(route)), []);
    await post('/projects/3/tasks/2/move', { destination: '1' });
    assert.deepEqual(rows(await html(route)), ['READ Notes']);
    await post('/projects/1/archive');
    const archived = await html(route);
    assert.deepEqual(rows(archived), ['READ Notes']);
    assert.match(archived, /id="task-search" name="searchQuery" type="text" value="read">/);
    assert.match(archived, /disabled>Rename task/);
    await post('/projects/1/restore');
    await server.stop();
    server = await launch(path.join(directory, 'db.sqlite'));
    assert.deepEqual(rows(await html(route)), ['READ Notes']);
    const reopened = await html('/projects/1');
    assert.deepEqual(rows(reopened), ['No match', 'READ Notes', 'Other', 'read undated']);
    assert.match(reopened, /id="task-search" name="searchQuery" type="text" value=""/);
    assert.match(await html('/'), /0\/4 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
