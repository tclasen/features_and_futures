import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

test('projects and tasks: validation, filtering, archive, summaries, migration, and restart persistence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-test-'));
  // Start with the previous schema to exercise migration of existing databases.
  const previousDb = new DatabaseSync(join(directory, 'projects.sqlite'));
  previousDb.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
  previousDb.close();
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let output = '';

  async function start() {
    child = spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'projects.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${base}/health`);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
        return;
      } catch {
        if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    throw new Error(`Server did not start: ${output}`);
  }

  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }

  async function create(name) {
    return fetch(`${base}/projects`, {
      method: 'POST',
      body: new URLSearchParams({ name }),
      redirect: 'manual',
    });
  }

  try {
    await start();
    const initial = await (await fetch(base)).text();
    assert.match(initial, /<h1>Workboard<\/h1>/);
    assert.match(initial, /<label for="project-name">Project name<\/label>/);
    assert.match(initial, />Create project<\/button>/);
    assert.equal((initial.match(/data-testid="project-row"/g) || []).length, 0);
    assert.match(initial, /<label for="project-filter">Project filter<\/label>/);
    assert.match(initial, /<option selected>Active<\/option><option>Archived<\/option>/);

    for (const blank of ['', '  \t\n ']) {
      const response = await create(blank);
      const html = await response.text();
      assert.equal(response.status, 422);
      assert.match(html, /role="alert">Project name is required/);
      assert.equal((html.match(/data-testid="project-row"/g) || []).length, 0);
    }

    for (const name of ['  First project  ', 'Second <project> 🎉']) {
      const response = await create(name);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/');
    }
    const html = await (await fetch(base)).text();
    assert.equal((html.match(/data-testid="project-row"/g) || []).length, 2);
    assert.equal((html.match(/data-testid="project-summary">0\/0 completed/g) || []).length, 2);
    assert.equal((html.match(/>Archive project<\/button>/g) || []).length, 2);
    assert.doesNotMatch(html, />Restore project<\/button>/);
    assert.match(html, />First project<\/span>/);
    assert.match(html, /Second &lt;project&gt; 🎉/);
    assert.ok(html.indexOf('First project') < html.indexOf('Second &lt;project&gt;'));
    const ids = [...html.matchAll(/action="\/projects\/(\d+)"/g)].map(match => match[1]);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[0], ids[1]);
    const detail = await (await fetch(`${base}/projects/${ids[0]}`)).text();
    assert.match(detail, /<h1>First project<\/h1>/);
    assert.match(detail, /action="\/".*>Projects<\/button>/);

    async function post(path, fields) {
      return fetch(`${base}${path}`, {
        method: 'POST', body: new URLSearchParams(fields), redirect: 'manual',
      });
    }
    async function projectHtml(id, filter = 'All') {
      return (await fetch(`${base}/projects/${id}?filter=${filter}`)).text();
    }
    const rows = page => [...page.matchAll(/<div class="task-row" data-testid="task-row">([\s\S]*?)<\/div>/g)].map(match => match[1]);
    assert.match(detail, /<label for="task-title">Task title<\/label>/);
    assert.match(detail, />Create task<\/button>/);
    assert.match(detail, /<label for="task-filter">Task filter<\/label>/);
    assert.match(detail, /<option selected>All<\/option>/);
    for (const title of ['', '  \t\n ']) {
      const response = await post(`/projects/${ids[0]}/tasks`, { title });
      assert.equal(response.status, 422);
      const invalid = await response.text();
      assert.match(invalid, /role="alert">Task title is required/);
      assert.equal(rows(invalid).length, 0);
    }
    for (const title of ['  First task  ', 'Second <task> "quoted" 🎉']) {
      assert.equal((await post(`/projects/${ids[0]}/tasks`, { title })).status, 303);
    }
    assert.equal((await post(`/projects/${ids[1]}/tasks`, { title: 'Other project task' })).status, 303);
    const openHtml = await projectHtml(ids[0]);
    const openRows = rows(openHtml);
    assert.equal(openRows.length, 2);
    assert.match(openRows[0], /<span>First task<\/span>/);
    assert.match(openRows[0], /aria-label="Complete First task"/);
    assert.match(openRows[1], /Second &lt;task&gt; &quot;quoted&quot; 🎉/);
    assert.ok(openRows.every(row => !row.includes(' checked')));
    assert.equal(rows(await projectHtml(ids[0], 'Open')).length, 2);
    assert.equal(rows(await projectHtml(ids[0], 'Completed')).length, 0);
    assert.equal(rows(await projectHtml(ids[1])).length, 1);
    assert.doesNotMatch(await projectHtml(ids[1]), /First task/);
    const taskId = /action="\/projects\/\d+\/tasks\/(\d+)"/.exec(openRows[0])[1];
    assert.equal((await post(`/projects/${ids[1]}/tasks/${taskId}`, { completed: '1' })).status, 404);
    assert.equal((await post(`/projects/${ids[0]}/tasks/${taskId}`, [['completed', '0'], ['completed', '1']])).status, 303);
    const completedHtml = await projectHtml(ids[0]);
    assert.match(rows(completedHtml)[0], / checked/);
    assert.doesNotMatch(rows(completedHtml)[1], / checked/);
    assert.match(rows(await projectHtml(ids[0], 'Open'))[0], /Second &lt;task&gt;/);
    const completedRows = rows(await projectHtml(ids[0], 'Completed'));
    assert.equal(completedRows.length, 1);
    assert.match(completedRows[0], /First task/);

    const projectRows = page => [...page.matchAll(/<div class="project-row" data-testid="project-row">([\s\S]*?)<\/form><\/div>\s*<\/div>/g)].map(match => match[1]);
    const summarized = await (await fetch(base)).text();
    assert.match(projectRows(summarized)[0], /data-testid="project-summary">1\/2 completed/);
    assert.match(projectRows(summarized)[1], /data-testid="project-summary">0\/1 completed/);
    assert.equal((await post(`/projects/${ids[0]}/archive`, {})).status, 303);
    const active = await (await fetch(base)).text();
    assert.equal(projectRows(active).length, 1);
    assert.doesNotMatch(active, /First project/);
    const archivedList = await (await fetch(`${base}/?filter=Archived`)).text();
    assert.equal(projectRows(archivedList).length, 1);
    assert.match(archivedList, /<option selected>Archived<\/option>/);
    assert.match(archivedList, /data-testid="project-summary">1\/2 completed/);
    assert.match(archivedList, />Open project<\/button>/);
    assert.match(archivedList, />Restore project<\/button>/);
    assert.doesNotMatch(archivedList, />Archive project<\/button>/);
    const archivedDetail = await projectHtml(ids[0]);
    assert.match(archivedDetail, />Archived project<\/p>/);
    assert.match(archivedDetail, /<button type="submit" disabled>Create task<\/button>/);
    assert.equal(rows(archivedDetail).length, 2);
    assert.ok(rows(archivedDetail).every(row => /type="checkbox"[^>]* disabled/.test(row)));
    assert.match(rows(await projectHtml(ids[0], 'Completed'))[0], /First task/);
    assert.match(rows(await projectHtml(ids[0], 'Open'))[0], /Second &lt;task&gt;/);
    assert.equal((await post(`/projects/${ids[0]}/tasks`, { title: 'Blocked task' })).status, 403);
    assert.equal((await post(`/projects/${ids[0]}/tasks/${taskId}`, { completed: '0' })).status, 403);
    assert.equal(await projectHtml(ids[0]), archivedDetail);
    assert.equal((await post('/projects/999999/archive', {})).status, 404);

    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), archivedDetail);
    assert.equal(await (await fetch(`${base}/?filter=Archived`)).text(), archivedList);
    assert.equal(await (await fetch(base)).text(), active);
    assert.equal((await post(`/projects/${ids[0]}/restore`, {})).status, 303);
    assert.equal(await projectHtml(ids[0]), completedHtml);
    assert.equal(await (await fetch(base)).text(), summarized);
    assert.equal(projectRows(await (await fetch(`${base}/?filter=Archived`)).text()).length, 0);

    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), completedHtml);
    assert.equal(rows(await projectHtml(ids[1])).length, 1);
    assert.equal((await post(`/projects/${ids[0]}/tasks/${taskId}`, { completed: '0', filter: 'Completed' })).status, 303);
    assert.equal(rows(await projectHtml(ids[0], 'Completed')).length, 0);
    assert.equal(rows(await projectHtml(ids[0], 'Open')).length, 2);
    await stop();
    await start();
    assert.equal(await projectHtml(ids[0]), openHtml);
    const finalList = await (await fetch(base)).text();
    assert.equal(projectRows(finalList).length, 2);
    assert.match(projectRows(finalList)[0], /data-testid="project-summary">0\/2 completed/);
    assert.match(projectRows(finalList)[1], /data-testid="project-summary">0\/1 completed/);
    assert.equal(await (await fetch(`${base}/projects/${ids[0]}`)).text(), openHtml);
    assert.equal((await fetch(`${base}/projects/999999`)).status, 404);
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
