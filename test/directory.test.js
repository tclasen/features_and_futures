import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function start(path) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: path }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    child.once('exit', code => reject(new Error(`Server exited ${code}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
    child.stderr.on('data', () => {});
  });
  return { url, stop: () => new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); }) };
}

test('directory is read-only, ordered, intersects filters and preserves applied ranges on errors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-directory-'));
  const path = join(directory, 'db.sqlite');
  let server;
  try {
    server = await start(path);
    const post = (route, data) => fetch(server.url + route, {
      method: 'POST', body: new URLSearchParams(data), redirect: 'manual',
    });
    const task = (title, fields = {}) => ({ title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false, ...fields });
    const importProject = (name, archived, tasks) => post('/projects/import', {
      importedName: name, projectJson: JSON.stringify({ format: 'workboard-project', version: 1,
        project: { name, archived, defaultPriority: 'High', tasks } }),
    });
    await importProject('First owner', false, [
      task('  MIXED\t  title 雪  ', { priority: 'High', dueDate: '2000-02-29', notes: '  <b>&雪</b>\nnext\n  ' }),
      task('Deleted title', { deleted: true, completed: true, priority: 'Low', dueDate: '2000-03-01' }),
      task('Completed title', { completed: true, dueDate: '2000-03-02' }),
    ]);
    await importProject('Second owner', false, [task('Undated title'), task('Last title', { priority: 'High', dueDate: '2000-03-01' })]);
    await importProject('Archived owner', true, [task('Archived live'), task('Archived deleted', { deleted: true })]);
    const snapshot = () => {
      const db = new DatabaseSync(path);
      try { return ['projects', 'tasks', 'task_positions'].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); }
      finally { db.close(); }
    };
    const before = snapshot();
    const get = async query => (await fetch(server.url + query)).text();
    const titles = html => [...html.matchAll(/data-testid="directory-task-title">([^<]*)</g)].map(match => match[1]);
    assert.match(await get('/'), /action="\/directory"[^>]*><button[^>]*>Task directory/);
    const all = await get('/directory');
    assert.deepEqual(titles(all), ['  MIXED\t  title 雪  ', 'Completed title', 'Undated title', 'Last title']);
    for (const [id, value] of [['project-name', 'First owner'], ['task-completion', 'Open'], ['task-priority', 'High'], ['task-due-date', '2000-02-29']]) {
      assert.ok(all.includes(`data-testid="directory-${id}">${value}</span>`));
    }
    assert.ok(all.includes('white-space: pre-wrap">  &lt;b&gt;&amp;雪&lt;/b&gt;\nnext\n  </div>'));
    const rows = all.match(/<li data-testid="directory-task-row">[\s\S]*?<\/li>/g);
    for (const row of rows) {
      assert.doesNotMatch(row, /<input|<select|<textarea|method="post"/);
      assert.match(row, /action="\/projects\/\d+" method="get"/);
    }
    assert.deepEqual(titles(await get('/directory?search=+mixed%09%09title+')), ['  MIXED\t  title 雪  ']);
    assert.deepEqual(titles(await get('/directory?search=First+owner')), []);
    assert.deepEqual(titles(await get('/directory?search=next')), []);
    assert.deepEqual(titles(await get('/directory?filter=Open&priorityFilter=High&dueFrom=2000-03-01&dueThrough=2000-03-01&search=TITLE')), ['Last title']);
    assert.deepEqual(titles(await get('/directory?filter=Completed')), ['Completed title']);
    assert.deepEqual(titles(await get('/directory?filter=Deleted&priorityFilter=Low&dueThrough=2000-03-01&search=title')), ['Deleted title']);
    assert.deepEqual(titles(await get('/directory?scope=Archived')), ['Archived live']);
    assert.deepEqual(titles(await get('/directory?scope=Archived&filter=Deleted')), ['Archived deleted']);
    const applied = await get('/directory/due-range?filter=All&priorityFilter=High&search=title&from=+2000-02-29+&through=2000-03-01');
    assert.deepEqual(titles(applied), ['  MIXED\t  title 雪  ', 'Last title']);
    assert.match(applied, /name="dueFrom" value="2000-02-29"/);
    assert.match(applied, /name="search" value="title"/);
    assert.match(applied, /<option selected>High<\/option>/);
    for (const [from, through, message] of [
      ['1900-02-29', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2000-04-31', '', 'Due range must use valid YYYY-MM-DD dates'],
      ['2000-03-02', '2000-03-01', 'Due from must not be after Due through'],
    ]) {
      const params = new URLSearchParams({ priorityFilter: 'High', search: 'title', dueFrom: '2000-02-29', dueThrough: '2000-03-01', from, through });
      const response = await fetch(server.url + '/directory/due-range?' + params);
      assert.equal(response.status, 422);
      const html = await response.text();
      assert.ok(html.includes(`role="alert">${message}`));
      assert.deepEqual(titles(html), titles(applied));
    }
    assert.deepEqual(snapshot(), before);
    await server.stop();
    server = await start(path);
    assert.deepEqual(titles(await get('/directory')), titles(all));
    assert.deepEqual(snapshot(), before);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
