import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProjectImport } from '../import.js';

const task = { title: '  Literal <b>任务</b>  ', completed: true, priority: 'High', dueDate: '2000-02-29', notes: ' \r\n Unicode 🌿\rmarkup <b> \n', deleted: true };
const document = () => ({ format: 'workboard-project', version: 1, project: { name: 'Original', archived: false, defaultPriority: 'Low', tasks: [{ ...task }] } });

test('import validates required public fields, preserving text and normalizing only notes line endings', () => {
  const value = document();
  value.project.id = 'existing';
  value.project.tasks[0].position = -1;
  const parsed = parseProjectImport(JSON.stringify(value));
  assert.deepEqual(parsed, { name: 'Original', archived: false, defaultPriority: 'Low', tasks: [{ ...task, notes: ' \n Unicode 🌿\nmarkup <b> \n' }] });
  value.project.tasks = [];
  assert.deepEqual(parseProjectImport(JSON.stringify(value)).tasks, []);
  for (const dueDate of ['', '0001-01-01', '9999-12-31', '2024-02-29']) {
    value.project.tasks = [{ ...task, dueDate }];
    assert.ok(parseProjectImport(JSON.stringify(value)));
  }
});

test('malformed documents and any invalid later task are rejected in full', () => {
  for (const json of ['', '{', 'null', '[]', 'true', '{}']) assert.equal(parseProjectImport(json), null);
  const invalidFields = {
    format: [undefined, 'other', 1], version: [undefined, '1', 2, 1.5],
    project: [undefined, null, [], 'project'],
  };
  for (const [field, values] of Object.entries(invalidFields)) {
    for (const value of values) {
      const input = document();
      input[field] = value;
      assert.equal(parseProjectImport(JSON.stringify(input)), null);
    }
  }
  for (const [field, values] of Object.entries({ name: [undefined, '', ' \t ', 1], archived: [undefined, 0, 'false'], defaultPriority: [undefined, 'normal', ''], tasks: [undefined, {}, null] })) {
    for (const value of values) {
      const input = document();
      input.project[field] = value;
      assert.equal(parseProjectImport(JSON.stringify(input)), null);
    }
  }
  for (const [field, values] of Object.entries({ title: [undefined, '', ' \n ', 1], completed: [undefined, 0, 'true'], priority: [undefined, 'Other'], dueDate: [undefined, null, 1, ' ', '2023-02-29', '1900-02-29', '0000-01-01', '2024-04-31', '2024-1-01', ' 2024-01-01 '], notes: [undefined, null, 1], deleted: [undefined, 0, 'false'] })) {
    for (const value of values) {
      const input = document();
      input.project.tasks.push({ ...task, [field]: value });
      assert.equal(parseProjectImport(JSON.stringify(input)), null, `${field}: ${value}`);
    }
  }
});
