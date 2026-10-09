import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { openStore } from '../store.js';

test('upgrades existing SQLite projects and tasks without data loss', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-migration-'));
  let store;
  try {
    const path = join(directory, 'legacy.sqlite');
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
      CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id), title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
      INSERT INTO projects (id, name) VALUES (42, 'Existing project');
      INSERT INTO tasks (project_id, title, completed) VALUES (42, 'Existing task', 1);
    `);
    legacy.close();
    store = openStore(path);
    const expected = { id: 42, name: 'Existing project', archived: false, totalCount: 1, completedCount: 1 };
    assert.deepEqual(store.getProject(42), expected);
    store.setProjectArchived(42, true);
    store.close();
    store = openStore(path);
    assert.deepEqual(store.listProjects(), [{ ...expected, archived: true }]);
    assert.equal(store.listTasks(42)[0].completed, true);
    assert.equal(store.createProject('Next').id, 43);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.attributes = {};
    this.value = '';
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelector() { return this.button ??= new Element(); }
  focus() {}
  async trigger(name) { await this.listeners[name]({ preventDefault() {} }); }
}

async function loadUI(pathname, fetch) {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  element('#project-filter').value = 'active';
  element('#task-filter').value = 'all';
  const navigations = [];
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document: { querySelector: element, createElement: () => new Element() },
    window: { location: { pathname, assign: (path) => navigations.push(path) } },
    fetch,
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { element, navigations };
}

const response = (data) => ({ ok: true, json: async () => structuredClone(data) });

test('project UI defaults to Active, renders summaries, archives and restores in order', async () => {
  let projects = [
    { id: 1, name: 'First', archived: false, completedCount: 1, totalCount: 2 },
    { id: 2, name: 'Second', archived: false, completedCount: 0, totalCount: 0 },
  ];
  const { element, navigations } = await loadUI('/', async (path, options = {}) => {
    if (options.method === 'PATCH') {
      const id = Number(path.split('/').at(-1));
      projects = projects.map((project) => project.id === id ? { ...project, ...JSON.parse(options.body) } : project);
      return response(projects.find((project) => project.id === id));
    }
    return response(projects);
  });
  const rows = () => element('#projects').children;
  assert.deepEqual(rows().map((row) => row.children[0].textContent), ['First', 'Second']);
  assert.equal(rows()[0].dataset.testid, 'project-row');
  assert.equal(rows()[0].children[1].dataset.testid, 'project-summary');
  assert.equal(rows()[0].children[1].textContent, '1/2 completed');
  assert.equal(rows()[1].children[1].textContent, '0/0 completed');
  assert.equal(rows()[0].children[3].textContent, 'Archive project');
  await rows()[0].children[3].trigger('click');
  assert.deepEqual(rows().map((row) => row.children[0].textContent), ['Second']);
  element('#project-filter').value = 'archived';
  await element('#project-filter').trigger('change');
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].children[1].textContent, '1/2 completed');
  assert.equal(rows()[0].children[2].textContent, 'Open project');
  await rows()[0].children[2].trigger('click');
  assert.deepEqual(navigations, ['/projects/1']);
  assert.equal(rows()[0].children[3].textContent, 'Restore project');
  await rows()[0].children[3].trigger('click');
  assert.equal(rows().length, 0);
  element('#project-filter').value = 'active';
  await element('#project-filter').trigger('change');
  assert.deepEqual(rows().map((row) => row.children[0].textContent), ['First', 'Second']);
});

test('archived project UI is read-only while task filtering remains available', async () => {
  const requests = [];
  const tasks = [
    { id: 1, title: 'Open task', completed: false },
    { id: 2, title: 'Done task', completed: true },
  ];
  const { element } = await loadUI('/projects/1', async (path, options) => {
    requests.push({ path, options });
    return response(path.endsWith('/tasks') ? tasks : { id: 1, name: 'Archived name', archived: true });
  });
  const rows = () => element('#tasks').children;
  assert.equal(element('#heading').textContent, 'Archived name');
  assert.equal(element('#archived-notice').hidden, false);
  assert.equal(element('#create-task').querySelector('button').disabled, true);
  assert.equal(rows().length, 2);
  assert.ok(rows().every((row) => row.children[1].disabled));
  element('#task-title').value = 'Not allowed';
  await element('#create-task').trigger('submit');
  assert.equal(requests.length, 2);
  for (const [filter, title] of [['open', 'Open task'], ['completed', 'Done task']]) {
    element('#task-filter').value = filter;
    await element('#task-filter').trigger('change');
    assert.equal(rows().length, 1);
    assert.equal(rows()[0].children[0].textContent, title);
    assert.equal(rows()[0].children[1].disabled, true);
  }
  element('#task-filter').value = 'all';
  await element('#task-filter').trigger('change');
  assert.equal(rows().length, 2);
});
