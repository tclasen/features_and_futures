import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Exercise the shipped browser script with a small DOM adapter and controlled
// requests. No browser package or application dependency is required.
class Element {
  constructor(tag, root = false) {
    this.tag = tag;
    this.root = root;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this.textContent = '';
  }
  get isConnected() { return this.root || Boolean(this.parent?.isConnected); }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parent = undefined;
    this.children = [];
    this.append(...children);
  }
  set innerHTML(html) {
    this.replaceChildren();
    const stack = [this];
    for (const token of html.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) {
        stack.pop();
      } else if (token.startsWith('<')) {
        const tag = token.match(/^<(\w+)/)[1];
        const element = new Element(tag);
        for (const match of token.matchAll(/([\w-]+)="([^"]*)"/g)) {
          element.setAttribute(match[1], match[2]);
        }
        element.disabled = /\sdisabled[\s>]/.test(token);
        element.hidden = /\shidden[\s>]/.test(token);
        stack.at(-1).append(element);
        if (tag !== 'input') stack.push(element);
      } else {
        stack.at(-1).textContent += token.trim();
      }
    }
    const select = this.querySelector('select');
    if (select) select.value = select.children[0].textContent;
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector.startsWith('#') ? child.attributes.id === selector.slice(1) :
          selector === '[role="alert"]' ? child.attributes.role === 'alert' : child.tag === selector) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  async emit(name) { await this.listeners[name]?.({ preventDefault() {} }); }
  focus() {}
}

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const settled = () => new Promise(resolve => setImmediate(resolve));

async function browser(storage, projects, pending = {}) {
  const app = new Element('main', true);
  const location = { pathname: '/' };
  const document = {
    querySelector: () => app,
    createElement: tag => new Element(tag),
  };
  runInNewContext(source, {
    document, location,
    history: { pushState(_state, _title, path) { location.pathname = path; } },
    window: { addEventListener() {} },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    fetch: async (path, options) => {
      let result;
      if (options?.method === 'PATCH') {
        if (pending.wait) await pending.wait;
        const project = projects.find(item => path === `/api/projects/${item.id}`);
        Object.assign(project, JSON.parse(options.body));
        result = { ...project };
      } else if (path === '/api/projects') {
        result = projects.map(item => ({ ...item }));
      } else if (path.endsWith('/tasks')) {
        result = [{ id: 1, title: 'Saved task', completed: true }];
      } else {
        result = { ...projects.find(item => path === `/api/projects/${item.id}`) };
      }
      return { ok: true, json: async () => result };
    },
  });
  await settled();
  return app;
}

function rows(app) { return app.querySelector('ul').children; }
function control(row, label) { return row.children.find(child => child.textContent === label); }
async function filter(app, value) {
  app.querySelector('select').value = value;
  await app.querySelector('select').emit('change');
}
const project = () => ({ id: 1, name: 'Archive lifecycle', archived: false, total_count: 1, completed_count: 1 });

test('archive and restore update the list even if the filter changes before the request finishes', async () => {
  const projects = [project()];
  let release;
  const pending = { wait: new Promise(resolve => { release = resolve; }) };
  const app = await browser(new Map(), projects, pending);
  assert.equal(app.querySelector('select').value, 'Active');
  const archive = control(rows(app)[0], 'Archive project').emit('click');
  await filter(app, 'Archived');
  assert.equal(rows(app).length, 0);
  release();
  await archive;
  assert.equal(rows(app).length, 1);
  assert.equal(control(rows(app)[0], '1/1 completed').dataset.testid, 'project-summary');
  pending.wait = new Promise(resolve => { release = resolve; });
  const restore = control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  assert.equal(rows(app).length, 0);
  release();
  await restore;
  assert.equal(rows(app).length, 1);
  assert.ok(control(rows(app)[0], 'Archive project'));
});

test('Archived filter survives reload and opening a read-only project then returning to Projects', async () => {
  const storage = new Map();
  const projects = [{ ...project(), archived: true }];
  let app = await browser(storage, projects);
  assert.equal(app.querySelector('select').value, 'Active');
  assert.equal(rows(app).length, 0);
  await filter(app, 'Archived');
  assert.equal(rows(app).length, 1);
  app = await browser(storage, projects);
  assert.equal(app.querySelector('select').value, 'Archived');
  assert.equal(rows(app).length, 1);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('h1').textContent, projects[0].name);
  assert.equal(app.querySelector('#archive-status').hidden, false);
  assert.equal(app.querySelector('form').querySelector('button').disabled, true);
  assert.equal(rows(app)[0].querySelector('input').disabled, true);
  await app.querySelector('#projects').emit('click');
  await settled();
  assert.equal(app.querySelector('select').value, 'Archived');
  assert.equal(rows(app).length, 1);
  await control(rows(app)[0], 'Restore project').emit('click');
  await filter(app, 'Active');
  assert.equal(rows(app).length, 1);
  await control(rows(app)[0], 'Open project').emit('click');
  await settled();
  assert.equal(app.querySelector('form').querySelector('button').disabled, false);
  assert.equal(rows(app)[0].querySelector('input').disabled, false);
  assert.equal(rows(app)[0].querySelector('input').checked, true);
  await app.querySelector('#projects').emit('click');
  await settled();
  assert.equal(app.querySelector('select').value, 'Active');
});
