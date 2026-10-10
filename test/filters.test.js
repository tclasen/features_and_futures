import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('combined filters preserve selections through edits, archive, and restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workboard-filters-'));
  let child;
  let url;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DB_PATH: join(dir, 'db.sqlite') }, stdio: ['ignore', 'pipe', 'pipe'] });
    url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000);
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Exited ${code}`)); });
      child.stdout.on('data', chunk => {
        const match = chunk.toString().match(/listening on port (\d+)/);
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
      });
    });
  };
  const stop = async () => { const exited = once(child, 'exit'); child.kill(); await exited; child = null; };
  const post = (path, values = {}) => fetch(url + path, { method: 'POST', body: new URLSearchParams(values), redirect: 'manual' });
  const page = path => fetch(url + path).then(r => r.text());
  const titles = html => [...html.matchAll(/aria-label="Complete ([^"]+)"/g)].map(m => m[1]);
  const selection = (html, id) => html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1].match(/<option selected>(.*?)<\/option>/)[1];
  const check = async (filter, priority, expected) => {
    const html = await page(`/projects/1?filter=${filter}&priorityFilter=${priority}`);
    assert.deepEqual(titles(html), expected);
    assert.equal(selection(html, 'task-filter'), filter);
    assert.equal(selection(html, 'priority-filter'), priority);
    return html;
  };
  try {
    await start();
    await post('/projects', { name: 'One' });
    await post('/projects', { name: 'Two' });
    for (const title of ['Low open', 'Normal open', 'High done', 'High open']) await post('/projects/1/tasks', { title });
    await post('/projects/2/tasks', { title: 'Other project' });
    await post('/projects/1/tasks/1/priority', { priority: 'Low' });
    await post('/projects/1/tasks/3/priority', { priority: 'High' });
    await post('/projects/1/tasks/4/priority', { priority: 'High' });
    await post('/projects/1/tasks/3', { completed: '1' });
    const expected = { All: ['Low open', 'Normal open', 'High done', 'High open'], Low: ['Low open'], Normal: ['Normal open'], High: ['High done', 'High open'] };
    for (const filter of ['All', 'Open', 'Completed']) {
      for (const priority of ['All', 'Low', 'Normal', 'High']) {
        await check(filter, priority, expected[priority].filter(t => filter === 'All' || (t === 'High done') === (filter === 'Completed')));
      }
    }
    let html = await page('/projects/1');
    assert.equal(selection(html, 'priority-filter'), 'All');
    assert.deepEqual([...html.match(/<select id="priority-filter"[^>]*>([\s\S]*?)<\/select>/)[1].matchAll(/<option(?: selected)?>(.*?)<\/option>/g)].map(m => m[1]), ['All', 'Low', 'Normal', 'High']);
    const filters = { filter: 'Open', priorityFilter: 'High' };
    const changed = await post('/projects/1/tasks/4/rename', { ...filters, title: '  Renamed  ' });
    assert.equal(changed.headers.get('location'), '/projects/1?filter=Open&priorityFilter=High');
    await check('Open', 'High', ['Renamed']);
    const invalid = await post('/projects/1/tasks/4/rename', { ...filters, title: '  ' });
    html = await invalid.text();
    assert.match(html, /Task title is required/);
    assert.equal(selection(html, 'task-filter'), 'Open');
    assert.equal(selection(html, 'priority-filter'), 'High');
    assert.deepEqual(titles(html), ['Renamed']);
    await post('/projects/1/tasks/4/priority', { ...filters, priority: 'Normal' });
    await check('Open', 'High', []);
    await post('/projects/1/tasks/4/priority', { ...filters, priority: 'High' });
    await check('Open', 'High', ['Renamed']);
    await post('/projects/1/tasks/4', { ...filters, completed: '1' });
    await check('Open', 'High', []);
    await check('Completed', 'High', ['High done', 'Renamed']);
    assert.match(await page('/'), /2\/4 completed/);
    await post('/projects/1/archive');
    html = await check('Completed', 'High', ['High done', 'Renamed']);
    assert.match(html, /Archived project/);
    assert.doesNotMatch(html, /<select id="(?:task-filter|priority-filter)"[^>]*disabled/);
    assert.equal((html.match(/<select id="task-priority-\d+"[^>]* disabled/g) || []).length, 2);
    await stop(); await start();
    assert.equal(await check('Completed', 'High', ['High done', 'Renamed']), html);
    await post('/projects/1/restore');
    html = await check('Completed', 'High', ['High done', 'Renamed']);
    assert.doesNotMatch(html, / disabled/);
    assert.match(await page('/'), /2\/4 completed/);
    assert.deepEqual(titles(await page('/projects/2')), ['Other project']);
  } finally {
    if (child) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
