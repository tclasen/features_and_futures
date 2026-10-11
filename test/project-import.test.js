import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openProjects } from '../projects.js';
import { parseProjectImport } from '../project-import.js';

function portableDocument() {
  return {
    format: 'workboard-project', version: 1,
    project: {
      name: 'Original', archived: false, defaultPriority: 'Low',
      tasks: [
        { title: '  First\tTITLE  ', completed: true, priority: 'High', dueDate: '2000-02-29',
          notes: '  😀 <literal>\r\nnext\rline\n  ', deleted: true },
        { title: 'Second', completed: false, priority: 'Normal', dueDate: '', notes: '', deleted: false },
      ],
    },
  };
}

test('import rejects missing fields, wrong types and invalid dates before any writes', () => {
  const projects = openProjects(':memory:');
  try {
    projects.create('Existing');
    projects.createTask(1, 'Unchanged');
    const before = projects.exportProject(1);
    const invalid = ['{', 'null', '[]', '{}'];
    for (const [field, values] of Object.entries({
      format: [undefined, 'other'], version: [undefined, '1', true, 1.1, 2],
      project: [undefined, null, []],
    })) {
      for (const value of values) {
        const document = portableDocument();
        document[field] = value;
        invalid.push(JSON.stringify(document));
      }
    }
    for (const [field, values] of Object.entries({
      name: [undefined, '', ' \t\n', 1], archived: [undefined, 0, 'false'],
      defaultPriority: [undefined, 'normal', 'Urgent'], tasks: [undefined, null, {}],
    })) {
      for (const value of values) {
        const document = portableDocument();
        document.project[field] = value;
        invalid.push(JSON.stringify(document));
      }
    }
    // Corrupt the later task: the earlier valid task must never be inserted.
    for (const [field, values] of Object.entries({
      title: [undefined, '', ' \n\t ', null], completed: [undefined, 1, 'true'],
      priority: [undefined, 'low'], notes: [undefined, null, 1], deleted: [undefined, 0],
      dueDate: [undefined, null, ' ', ' 2000-02-29 ', '1900-02-29', '2023-02-29',
        '0000-01-01', '10000-01-01', '2024-04-31', '2024-2-01'],
    })) {
      for (const value of values) {
        const document = portableDocument();
        document.project.tasks[1][field] = value;
        invalid.push(JSON.stringify(document));
      }
    }
    for (const task of [null, [], 1]) {
      const document = portableDocument();
      document.project.tasks[1] = task;
      invalid.push(JSON.stringify(document));
    }
    for (const json of invalid) {
      assert.equal(parseProjectImport(json), null, json);
      assert.deepEqual(projects.importProject(json, 'Copy'), { error: 'Invalid project JSON' });
      assert.equal(projects.list().length, 1);
      assert.deepEqual(projects.exportProject(1), before);
    }
    assert.deepEqual(projects.importProject(JSON.stringify(portableDocument()), ' \n\t '),
      { error: 'Project name is required' });
    assert.deepEqual(projects.importProject('{', ''), { error: 'Project name is required' });
    // Failed validation did not consume project/task identities either.
    assert.deepEqual(projects.importProject(JSON.stringify(portableDocument()), 'Copy'), { id: 2 });
    assert.equal(projects.listTasks(2, 'Deleted')[0].id, 2);
  } finally {
    projects.close();
  }
});

test('import preserves exact fields and independent identities, with persistent reserved positions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workboard-import-'));
  let projects;
  try {
    const path = join(directory, 'workboard.sqlite');
    projects = openProjects(path);
    projects.create('Original');
    projects.createTask(1, 'Original task');
    const original = projects.exportProject(1);
    const document = portableDocument();
    document.project.archived = true;
    document.project.id = 1;
    document.project.tasks[0].id = 1;
    document.project.tasks[0].project_id = 1;
    document.project.tasks[0].position = 999;
    assert.deepEqual(projects.importProject(JSON.stringify(document), '  Copy 😀  '), { id: 2 });
    const expected = portableDocument();
    expected.project.name = 'Copy 😀';
    expected.project.archived = true;
    expected.project.tasks[0].notes = expected.project.tasks[0].notes.replace(/\r\n?/g, '\n');
    assert.deepEqual(projects.exportProject(2), expected);
    assert.equal(projects.list('Archived')[0].total_count, 1);
    assert.equal(projects.list('Archived')[0].completed_count, 0);
    assert.equal(projects.setTaskDeleted(2, 2, false), false);
    projects.close();
    projects = openProjects(path);
    assert.deepEqual(projects.exportProject(2), expected);
    projects.setArchived(2, false);
    projects.setDefaultTaskPriority(2, 'Normal');
    projects.createTask(2, 'Later');
    projects.setTaskDeleted(2, 2, false);
    assert.deepEqual(projects.listTasks(2).map((task) => task.title), ['  First\tTITLE  ', 'Second', 'Later']);
    assert.equal(projects.listTasks(2)[0].priority, 'High');
    projects.moveTask(2, 2, 1);
    projects.moveTask(2, 3, 1);
    projects.moveTask(1, 3, 2);
    projects.moveTask(1, 2, 2);
    assert.deepEqual(projects.listTasks(2).map((task) => task.title), ['  First\tTITLE  ', 'Second', 'Later']);
    projects.renameTask(2, 2, 'Renamed');
    assert.deepEqual(projects.exportProject(1), original);
    projects.close();
    projects = openProjects(path);
    assert.deepEqual(projects.listTasks(2).map((task) => task.title), ['Renamed', 'Second', 'Later']);
    assert.equal(projects.listTasks(2)[0].notes, expected.project.tasks[0].notes);
    const empty = portableDocument();
    empty.project.tasks = [];
    assert.deepEqual(projects.importProject(JSON.stringify(empty), 'Empty'), { id: 3 });
    assert.deepEqual(projects.exportProject(3).project.tasks, []);
    for (const dueDate of ['0001-01-01', '9999-12-31', '2024-02-29']) {
      const valid = portableDocument();
      valid.project.tasks[0].dueDate = dueDate;
      assert.ok(parseProjectImport(JSON.stringify(valid)));
    }
  } finally {
    if (projects) projects.close();
    await rm(directory, { recursive: true, force: true });
  }
});
