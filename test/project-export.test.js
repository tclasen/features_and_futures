import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectExport } from '../project-export.js';

test('portable export supplies older-record defaults and omits internal fields', () => {
  assert.deepEqual(projectExport({ id: 7, name: 'Original  Name' }, [
    { id: 3, title: 'Original\tTitle', completed: 1, position: 5 },
  ]), {
    format: 'workboard-project', version: 1,
    project: {
      name: 'Original  Name', archived: false, defaultPriority: 'Normal',
      tasks: [{ title: 'Original\tTitle', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false }],
    },
  });
});

test('portable notes normalize textarea line breaks without changing other text or source data', () => {
  const project = { name: '日本語 <b> Name', archived: true, defaultPriority: 'Low' };
  const task = {
    title: 'Mixed CASE  title', completed: false, priority: 'High', dueDate: '0001-01-01',
    notes: '  Unicode 😀\r\n\t<script>literal</script>\rNext\nEnd  ', deleted: true,
  };
  const before = structuredClone(task);
  const exported = projectExport(project, [task]);
  assert.deepEqual(exported.project, {
    ...project,
    tasks: [{ ...task, notes: '  Unicode 😀\n\t<script>literal</script>\nNext\nEnd  ' }],
  });
  assert.deepEqual(task, before);
  assert.deepEqual(projectExport(project, []).project.tasks, []);
});
