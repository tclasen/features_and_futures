import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function start(databasePath) {
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: '0', DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Server exited: ${code}, ${output}`)));
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) resolve(match[1]);
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

const rows = (body) => [...body.matchAll(/data-testid="task-row">\s*<span>(.*?)<\/span>/g)].map((match) => match[1]);

test('inclusive due ranges intersect filters, validate without changing membership, and survive edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-range-'));
  let server;
  try {
    server = await start(join(directory, 'db.sqlite'));
    const post = (path, fields = {}) => fetch(`${server.url}${path}`, {
      method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
    });
    const html = async (path) => (await fetch(`${server.url}${path}`)).text();
    await post('/projects', { name: 'Ranges' });
    const tasks = [
      { title: 'Undated', date: '', priority: 'Normal', completed: false },
      { title: 'Early', date: '0001-01-01', priority: 'Low', completed: true },
      { title: 'Start', date: '2024-02-29', priority: 'High', completed: false },
      { title: 'End', date: '2024-03-01', priority: 'High', completed: true },
      { title: 'Late', date: '9999-12-31', priority: 'Normal', completed: false },
    ];
    for (const [index, task] of tasks.entries()) {
      const path = `/projects/1/tasks/${index + 1}`;
      await post('/projects/1/tasks', { title: task.title });
      await post(`${path}/due-date`, { dueDate: task.date });
      await post(`${path}/priority`, { priority: task.priority });
      if (task.completed) await post(path, { completed: '1' });
    }
    const ranges = [['', ''], ['', '2024-02-29'], ['2024-03-01', ''], ['2024-02-29', '2024-03-01'], ['2024-02-29', '2024-02-29']];
    for (const [from, through] of ranges) {
      for (const filter of ['All', 'Open', 'Completed']) {
        for (const priorityFilter of ['All', 'Low', 'Normal', 'High']) {
          const response = await post('/projects/1/due-range', { from: ` ${from} `, through: ` ${through} `, filter, priorityFilter });
          assert.equal(response.status, 303);
          const body = await html(response.headers.get('location'));
          assert.deepEqual(rows(body), tasks.filter((task) =>
            (filter === 'All' || task.completed === (filter === 'Completed')) &&
            (priorityFilter === 'All' || task.priority === priorityFilter) &&
            ((!from && !through) || (task.date && (!from || task.date >= from) && (!through || task.date <= through)))
          ).map((task) => task.title));
        }
      }
    }
    const fields = { filter: 'All', priorityFilter: 'High', dueFrom: '2024-02-29', dueThrough: '2024-03-01' };
    const view = `/projects/1?${new URLSearchParams(fields)}`;
    const before = await html(view);
    for (const form of before.matchAll(/<form[^>]*action="\/projects\/1[^\"]*"[^>]*>([\s\S]*?)<\/form>/g)) {
      assert.match(form[1], /name="dueFrom" value="2024-02-29"/);
      assert.match(form[1], /name="dueThrough" value="2024-03-01"/);
    }
    for (const [from, through] of [['2023-02-29', ''], ['', '1900-02-29'], ['0000-01-01', ''], ['2024-2-29', ''], ['2024-03-02', '2024-03-01']]) {
      const response = await post('/projects/1/due-range', { ...fields, from, through });
      assert.equal(response.status, 400);
      const body = await response.text();
      assert.match(body, from === '2024-03-02' ? /Due from must not be after Due through/ : /Due range must use valid YYYY-MM-DD dates/);
      assert.deepEqual(rows(body), ['Start', 'End']);
      assert.match(body, /name="dueFrom" value="2024-02-29"/);
      assert.equal(await html(view), before);
    }
    const edit = async (path, values) => {
      const response = await post(path, { ...fields, ...values });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), view);
      return html(view);
    };
    assert.deepEqual(rows(await edit('/projects/1/tasks/3/rename', { title: 'Renamed' })), ['Renamed', 'End']);
    assert.deepEqual(rows(await edit('/projects/1/rename', { name: 'New project' })), ['Renamed', 'End']);
    assert.deepEqual(rows(await edit('/projects/1/default-priority', { priority: 'High' })), ['Renamed', 'End']);
    assert.deepEqual(rows(await edit('/projects/1/tasks', { title: 'New undated' })), ['Renamed', 'End']);
    assert.deepEqual(rows(await edit('/projects/1/tasks/3/due-date', { dueDate: '' })), ['End']);
    assert.deepEqual(rows(await edit('/projects/1/tasks/4/priority', { priority: 'Low' })), []);
    await edit('/projects/1/tasks/4/priority', { priority: 'High' });
    const openFields = { ...fields, filter: 'Open' };
    const openView = `/projects/1?${new URLSearchParams(openFields)}`;
    const changed = await post('/projects/1/tasks/4', openFields);
    assert.equal(changed.headers.get('location'), openView);
    assert.deepEqual(rows(await html(openView)), ['End']);
    await post('/projects/1/tasks/4', { ...openFields, completed: '1' });
    assert.deepEqual(rows(await html(openView)), []);
    assert.match(await html('/'), /2\/6 completed/);
    await post('/projects/1/archive');
    let body = await html(view);
    assert.match(body, /id="task-due-date-4"[^>]*disabled/);
    for (const id of ['due-from', 'due-through']) {
      assert.doesNotMatch(body.match(new RegExp(`<input id="${id}"[^>]*>`))[0], /disabled/);
    }
    const appliedArchived = await post('/projects/1/due-range', { from: '', through: '', filter: 'All', priorityFilter: 'All' });
    assert.equal(appliedArchived.status, 303);
    assert.equal(rows(await html(appliedArchived.headers.get('location'))).length, 6);
    await server.stop();
    server = await start(join(directory, 'db.sqlite'));
    assert.equal(await html(view), body);
    await post('/projects/1/restore');
    body = await html(view);
    assert.doesNotMatch(body, / disabled/);
    assert.deepEqual(rows(body), ['End']);
    const reopened = await html('/projects/1');
    assert.match(reopened, /id="due-from" name="from" type="text" value=""/);
    assert.match(reopened, /id="due-through" name="through" type="text" value=""/);
    assert.equal(rows(reopened).length, 6);
    assert.match(await html('/'), /2\/6 completed/);
  } finally {
    if (server) await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
