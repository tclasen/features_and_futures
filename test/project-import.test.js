import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProjectImport } from '../project-import.js';

const task = {
  title: '  MiXeD\t 日本語 <title>  ', completed: true, priority: 'High',
  dueDate: '2028-02-29', notes: ' \r\n📝</textarea>\r\n ', deleted: false,
};
const document = {
  format: 'workboard-project', version: 1,
  project: { name: 'Original', archived: false, defaultPriority: 'Low', tasks: [task] },
};

test('import copies only public fields, preserving titles and normalizing notes to LF', () => {
  const input = structuredClone(document);
  input.project.id = 999;
  input.project.tasks[0].id = 888;
  input.project.tasks[0].position = -1;
  const before = structuredClone(input);
  assert.deepEqual(parseProjectImport(JSON.stringify(input)), {
    ...document.project, tasks: [{ ...task, notes: ' \n📝</textarea>\n ' }],
  });
  assert.deepEqual(input, before);
  assert.deepEqual(parseProjectImport(JSON.stringify({
    ...document, project: { ...document.project, tasks: [] },
  })).tasks, []);
});

test('import requires every public field and rejects invalid values anywhere in the document', () => {
  for (const json of ['', '{', 'null', '[]', 'true', '42', '"text"']) {
    assert.equal(parseProjectImport(json), null);
  }
  for (const path of [[], ['project'], ['project', 'tasks', 0]]) {
    const object = path.reduce((value, key) => value[key], document);
    for (const key of Object.keys(object)) {
      const input = structuredClone(document);
      const target = path.reduce((value, part) => value[part], input);
      delete target[key];
      assert.equal(parseProjectImport(JSON.stringify(input)), null, `missing ${path.join('.')}.${key}`);
    }
  }
  const invalidRoot = {
    format: [null, 1, 'other'], version: ['1', 0, 2, 1.1, null], project: [null, [], 'project'],
  };
  const invalidProject = {
    name: ['', ' \t\n ', 1, null], archived: [0, 1, 'false', null],
    defaultPriority: ['', 'normal', 'Urgent', null], tasks: [null, {}, 'tasks'],
  };
  const invalidTask = {
    title: ['', ' \t\n ', 1, null], completed: [0, 1, 'true', null],
    priority: ['', 'normal', 'Urgent', null],
    dueDate: [null, 20280229, ' ', ' 2028-02-29', '2028-02-29 ', '0000-01-01',
      '10000-01-01', '2027-02-29', '1900-02-29', '2028-04-31', '2028-00-01', '2028-01-00'],
    notes: [null, 1, {}], deleted: [0, 1, 'false', null],
  };
  for (const [scope, values] of [['root', invalidRoot], ['project', invalidProject], ['task', invalidTask]]) {
    for (const [key, invalidValues] of Object.entries(values)) {
      for (const value of invalidValues) {
        const input = structuredClone(document);
        // A bad later task must reject the earlier valid task as well.
        input.project.tasks.push(structuredClone(task));
        const target = scope === 'root' ? input : scope === 'project' ? input.project : input.project.tasks[1];
        target[key] = value;
        assert.equal(parseProjectImport(JSON.stringify(input)), null, `${scope}.${key}: ${JSON.stringify(value)}`);
      }
    }
  }
  for (const dueDate of ['', '0001-01-01', '2000-02-29', '9999-12-31']) {
    const input = structuredClone(document);
    input.project.tasks[0].dueDate = dueDate;
    assert.equal(parseProjectImport(JSON.stringify(input)).tasks[0].dueDate, dueDate);
  }
});
