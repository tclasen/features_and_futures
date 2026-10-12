import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseProjectImport } from '../project-import.js';

const validDocument = () => ({
  format: 'workboard-project', version: 1,
  project: {
    name: ' Original ', archived: false, defaultPriority: 'Low',
    tasks: [{ title: '  Title\t 😀  ', completed: true, priority: 'High', dueDate: '2024-02-29', notes: '  <b>😀</b>\r\nNext\rEnd  ', deleted: false }],
  },
});

const parse = (document) => parseProjectImport(JSON.stringify(document));

test('import copies portable fields, preserves titles, and normalizes only notes line endings', () => {
  const document = validDocument();
  document.id = 90;
  document.project.id = 80;
  Object.assign(document.project.tasks[0], { id: 70, project_id: 80, position: 900 });
  assert.deepEqual(parse(document), {
    name: ' Original ', archived: false, defaultPriority: 'Low',
    tasks: [{ title: '  Title\t 😀  ', completed: true, priority: 'High', dueDate: '2024-02-29', notes: '  <b>😀</b>\nNext\nEnd  ', deleted: false }],
  });
  assert.ok(document.project.tasks[0].notes.includes('\r'));
  document.project.tasks = [];
  assert.deepEqual(parse(document).tasks, []);
});

test('import rejects malformed, missing, mistyped and unsupported required fields', () => {
  for (const source of ['{', '', 'null', '[]', '42', undefined, {}]) {
    assert.equal(parseProjectImport(source), null);
  }
  const cases = [
    [[], 'format', ['other', 1, null]],
    [[], 'version', ['1', 0, 2, 1.5, true]],
    [[], 'project', [null, [], 'project']],
    [['project'], 'name', ['', ' \t\n', 12, null]],
    [['project'], 'archived', [0, 1, 'false', null]],
    [['project'], 'defaultPriority', ['normal', '', 0, null]],
    [['project'], 'tasks', [null, {}, 'tasks']],
    [['project', 'tasks', 0], 'title', ['', ' \t\n', 12, null]],
    [['project', 'tasks', 0], 'completed', [0, 1, 'true', null]],
    [['project', 'tasks', 0], 'priority', ['normal', '', 0, null]],
    [['project', 'tasks', 0], 'dueDate', [null, 0, ' ', ' 2024-02-29 ', '0000-01-01', '10000-01-01', '1900-02-29', '2023-02-29', '2024-04-31', '2024-2-29']],
    [['project', 'tasks', 0], 'notes', [null, {}, 0]],
    [['project', 'tasks', 0], 'deleted', [0, 1, 'true', null]],
  ];
  for (const [path, field, values] of cases) {
    for (const value of values) {
      const document = validDocument();
      const target = path.reduce((object, key) => object[key], document);
      target[field] = value;
      assert.equal(parse(document), null, `${path.join('.')}.${field}: ${JSON.stringify(value)}`);
    }
    const document = validDocument();
    delete path.reduce((object, key) => object[key], document)[field];
    assert.equal(parse(document), null, `missing ${field}`);
  }
  for (const task of [null, [], 'task', {}]) {
    const document = validDocument();
    document.project.tasks.push(task);
    assert.equal(parse(document), null);
  }
  for (const dueDate of ['', '0001-01-01', '2000-02-29', '9999-12-31']) {
    const document = validDocument();
    document.project.tasks[0].dueDate = dueDate;
    assert.equal(parse(document).tasks[0].dueDate, dueDate);
  }
});
