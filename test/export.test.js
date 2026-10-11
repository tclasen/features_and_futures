import test from 'node:test';
import assert from 'node:assert/strict';
import { exportProject } from '../export.js';

test('portable export defaults added fields without changing original data', () => {
  const project = { name: 'Original  Name\tΩ' };
  const tasks = [{ title: 'Original\t Title', completed: 0 }];
  assert.deepEqual(exportProject(project, tasks), {
    format: 'workboard-project', version: 1,
    project: {
      name: project.name, archived: false, defaultPriority: 'Normal',
      tasks: [{ title: tasks[0].title, completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false }],
    },
  });
  assert.equal(tasks[0].notes, undefined);
});

test('export converts only notes line endings and preserves exact portable fields', () => {
  const notes = '  \r\nUnicode Ω <b>&\"\rnext\nlast  ';
  const project = { name: '  Saved  Name ', archived: 1, default_task_priority: 'High', id: 'private' };
  const task = { title: 'Saved  Title', completed: 1, priority: 'Low', due_date: '0001-01-01', notes, deleted: 1, id: 'private' };
  assert.deepEqual(exportProject(project, [task]).project, {
    name: project.name, archived: true, defaultPriority: 'High',
    tasks: [{ title: task.title, completed: true, priority: 'Low', dueDate: '0001-01-01', notes: '  \nUnicode Ω <b>&\"\nnext\nlast  ', deleted: true }],
  });
  assert.equal(task.notes, notes);
  assert.deepEqual(exportProject(project, []).project.tasks, []);
});
