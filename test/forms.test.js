import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../public/forms.js', import.meta.url), 'utf8');

// Model only the native form events and DOM methods used by the browser script.
// Navigation deliberately stays pending so later submissions share the page.
class Form extends EventTarget {
  constructor(values = {}, autoSubmit = false) {
    super();
    this.hidden = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value }]));
    this.autoSubmit = autoSubmit;
    this.submissions = [];
  }

  querySelector(selector) {
    const name = selector.match(/^input\[type="hidden"\]\[name="(.*?)"\]$/)?.[1];
    return this.hidden[name] || null;
  }

  hasAttribute(name) {
    return name === 'data-auto-submit' && this.autoSubmit;
  }

  requestSubmit() {
    this.dispatchEvent(new Event('submit'));
    this.submissions.push(Object.fromEntries(Object.entries(this.hidden).map(([name, input]) => [name, input.value])));
  }

  change() {
    this.dispatchEvent(new Event('change'));
  }
}

function loadForms(forms, controls) {
  runInNewContext(script, {
    document: {
      querySelectorAll(selector) {
        if (selector === 'form') return forms;
        assert.equal(selector, 'form[data-auto-submit]');
        return forms.filter((form) => form.autoSubmit);
      },
      getElementById(id) {
        return controls[id] || null;
      },
    },
  });
}

test('default-priority changes retain live filters before earlier navigation completes', () => {
  const filters = new Form({}, true);
  const defaultPriority = new Form({ filter: 'All', priorityFilter: 'All' }, true);
  const controls = {
    'task-filter': { value: 'All' },
    'priority-filter': { value: 'All' },
  };
  loadForms([filters, defaultPriority], controls);

  controls['task-filter'].value = 'Open';
  filters.change();
  controls['priority-filter'].value = 'High';
  filters.change();
  // The default form still contains All/All from the original rendered page.
  defaultPriority.change();
  assert.deepEqual(defaultPriority.submissions, [{ filter: 'Open', priorityFilter: 'High' }]);
});

test('manual task edits retain live selections and applied range/search rather than unsaved drafts', () => {
  const saved = {
    filter: 'All', priorityFilter: 'All', dueFrom: '2024-02-01',
    dueThrough: '2024-02-29', search: 'saved query',
  };
  const edit = new Form(saved);
  loadForms([edit], {
    'task-filter': { value: 'Completed' },
    'priority-filter': { value: 'Low' },
    'due-from': { value: 'invalid unsaved range' },
    'due-through': { value: '' },
    'task-search': { value: 'unapplied query' },
  });
  edit.change();
  assert.equal(edit.submissions.length, 0);
  edit.requestSubmit();
  assert.deepEqual(edit.submissions, [{ ...saved, filter: 'Completed', priorityFilter: 'Low' }]);
});

test('project actions retain the live archive filter and applied project query', () => {
  const archive = new Form({ filter: 'Active', search: 'saved query' });
  loadForms([archive], {
    'project-filter': { value: 'Archived' },
    'project-search': { value: 'unapplied query' },
  });
  archive.requestSubmit();
  assert.deepEqual(archive.submissions, [{ filter: 'Archived', search: 'saved query' }]);
});

test('navigation forms without filter fields still submit without adding query parameters', () => {
  const navigation = new Form();
  loadForms([navigation], {
    'task-filter': { value: 'Completed' },
    'priority-filter': { value: 'High' },
  });
  navigation.requestSubmit();
  assert.deepEqual(navigation.submissions, [{}]);
});
