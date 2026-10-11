import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('search normalizes spaces and tabs only for matching, without rewriting persisted data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-search-whitespace-'));
  let child;
  let base;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '0', DB_PATH: join(directory, 'db.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    base = await new Promise((resolve, reject) => {
      child.stdout.on('data', data => {
        const match = String(data).match(/port (\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`Exited ${code}`)));
    });
  };
  const stop = async () => {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  };
  const post = (path, values = {}) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(values), redirect: 'manual',
  });
  const html = path => fetch(base + path).then(response => response.text());
  const projectIds = text => [...text.matchAll(/method="get" action="\/projects\/(\d+)"/g)].map(m => Number(m[1]));
  const taskIds = text => [...text.matchAll(/class="completion-form"[^>]*tasks\/(\d+)\/completion/g)].map(m => Number(m[1]));
  const projectName = 'MiXeD  \t \t Board';
  const taskTitle = 'MiXeD\t\t  Task';
  try {
    await start();
    for (const name of [projectName, 'mixed board', 'mixed\nboard', 'mixed\u00a0board']) await post('/projects', { name });
    for (const title of [taskTitle, 'mixed task', 'mixed\ntask', 'mixed\u00a0task']) await post('/projects/1/tasks', { title });
    for (const query of ['mixed board', '  MIXED\t \tBOARD  ', 'xed\t bo']) {
      assert.deepEqual(projectIds(await html('/?' + new URLSearchParams({ search: query }))), [1, 2]);
    }
    for (const query of ['mixed task', '\t MIXED  \t TASK \t', 'xed\t ta']) {
      assert.deepEqual(taskIds(await html('/projects/1?' + new URLSearchParams({ search: query }))), [1, 2]);
    }
    await post('/projects/1/tasks/1/completion', { completed: '1' });
    assert.deepEqual(taskIds(await html('/projects/1?search=mixed%20task&filter=Completed')), [1]);
    await post('/projects/1/tasks/1/rename', { title: 'Renamed \t  Task', search: 'renamed task' });
    assert.deepEqual(taskIds(await html('/projects/1?search=renamed%20task')), [1]);
    await post('/projects/1/tasks/1/rename', { title: taskTitle });
    await post('/projects/1/archive');
    assert.deepEqual(projectIds(await html('/?search=mixed%20board')), [2]);
    assert.deepEqual(projectIds(await html('/?filter=Archived&search=MIXED%09%20BOARD')), [1]);
    assert.deepEqual(taskIds(await html('/projects/1?search=mixed%20task')), [1, 2]);
    await stop();
    await start();
    const list = await html('/?filter=Archived&search=mixed%20board');
    assert.deepEqual(projectIds(list), [1]);
    assert.ok(list.includes(projectName));
    const tasks = await html('/projects/1?search=mixed%20task');
    assert.deepEqual(taskIds(tasks), [1, 2]);
    assert.ok(tasks.includes(taskTitle));
    assert.ok((await html('/projects/1')).includes(taskTitle));
    await post('/projects/1/restore');
    assert.ok((await html('/')).includes(projectName));
  } finally {
    if (child) await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
