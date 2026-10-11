import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { renderDirectory } from '../views.js';

const state = {
  scope: 'Active', filter: 'All', priority: 'All',
  range: { from: '', through: '' }, query: '',
};

test('directory hides its old empty announcement during navigation and restores it on pageshow', () => {
  const html = renderDirectory([], state);
  assert.match(html, /id="directory-empty"[^>]*role="status">No matching tasks/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const empty = { hidden: false };
  const listeners = {};
  runInNewContext(script, {
    URL,
    document: {
      getElementById: (id) => id === 'directory-empty' ? empty : null,
      addEventListener: (type, listener) => { listeners[type] = listener; },
    },
    window: { addEventListener: (type, listener) => { listeners[type] = listener; } },
  });
  for (const path of ['/directory', '/directory/due-range', '/directory/complete', '/directory/reopen', '/directory/delete', '/directory/restore']) {
    listeners.submit({ target: { action: `http://localhost${path}` } });
    assert.equal(empty.hidden, true);
    listeners.pageshow();
    assert.equal(empty.hidden, false);
  }
  listeners.submit({ target: { action: 'http://localhost/' } });
  assert.equal(empty.hidden, false);
});

test('directory loading handler is safe when resolved results have no empty announcement', () => {
  const html = renderDirectory([{
    title: 'Visible', project_name: 'Owner', project_id: 'owner',
    completed: 0, priority: 'Normal', due_date: '', notes: '', deleted: 0,
  }], state);
  assert.doesNotMatch(html, /role="status">No matching tasks/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const listeners = {};
  runInNewContext(script, {
    URL,
    document: {
      getElementById: () => null,
      addEventListener: (type, listener) => { listeners[type] = listener; },
    },
    window: { addEventListener: (type, listener) => { listeners[type] = listener; } },
  });
  assert.doesNotThrow(() => listeners.submit({ target: { action: 'http://localhost/directory' } }));
  assert.doesNotThrow(() => listeners.pageshow());
});

test('owner rows use identities and creation order independently of globally sorted tasks', () => {
  const task = (project_id, project_position, completed) => ({
    project_id, project_position, completed, project_name: 'Same <Ω>',
    title: 'Title', priority: 'Normal', due_date: '', notes: '', deleted: 0,
  });
  const tasks = [task('later', 8, 1), task('earlier', 2, 0), task('later', 8, 0)];
  const before = structuredClone(tasks);
  const html = renderDirectory(tasks, { ...state, order: 'Title' });
  const rows = [...html.matchAll(/data-testid="directory-owner-row">([\s\S]*?)<\/li>/g)].map((match) => match[1]);
  assert.equal(rows.length, 2);
  assert.match(rows[0], /action="\/projects\/earlier"/);
  assert.match(rows[0], /directory-owner-summary">0\/1 completed/);
  assert.match(rows[1], /action="\/projects\/later"/);
  assert.match(rows[1], /directory-owner-summary">1\/2 completed/);
  for (const row of rows) assert.match(row, /directory-owner-name">Same &lt;Ω&gt;<\/span>/);
  assert.deepEqual(tasks, before);
  assert.doesNotMatch(renderDirectory([], state), /data-testid="directory-owner-row"/);
});
