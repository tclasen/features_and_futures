import test from 'node:test';
import assert from 'node:assert/strict';
import { projectExport } from '../project-export.js';

test('portable export supplies legacy defaults and normalizes only notes line endings', () => {
  const project = { name: 'MiXeD  \t Project' };
  const tasks = [
    { title: 'Old  task', completed: 1 },
    {
      title: 'Unicode 日本語 <task>', completed: 0, priority: 'High',
      due_date: '0001-01-01', notes: ' \r\n日本語 📝\r<markup>\n\t ', deleted: 1,
    },
  ];
  const before = structuredClone({ project, tasks });
  assert.deepEqual(projectExport(project, tasks), {
    format: 'workboard-project', version: 1,
    project: {
      name: project.name, archived: false, defaultPriority: 'Normal',
      tasks: [
        { title: 'Old  task', completed: true, priority: 'Normal', dueDate: '', notes: '', deleted: false },
        {
          title: tasks[1].title, completed: false, priority: 'High', dueDate: '0001-01-01',
          notes: ' \n日本語 📝\n<markup>\n\t ', deleted: true,
        },
      ],
    },
  });
  assert.deepEqual({ project, tasks }, before);
});
