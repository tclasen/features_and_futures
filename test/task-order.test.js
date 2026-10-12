import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createTaskOrdering } from '../src/task-order.js';

test('failed creation or stale movement rolls back tasks and remembered positions together', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(`PRAGMA foreign_keys = ON;
      CREATE TABLE projects (id INTEGER PRIMARY KEY);
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, priority TEXT NOT NULL, position INTEGER NOT NULL
      );
      INSERT INTO projects VALUES (1), (2), (3);`);
    const ordering = createTaskOrdering(database);
    ordering.create(1, 'Original', 'Normal');
    const originalTasks = database.prepare('SELECT * FROM tasks').all();
    const originalPositions = database.prepare('SELECT * FROM task_project_positions').all();

    // A stale source must not reserve a destination position or change ownership.
    assert.throws(() => ordering.move(1, 3, 2), /no longer in its source project/);
    assert.deepEqual(database.prepare('SELECT * FROM tasks').all(), originalTasks);
    assert.deepEqual(database.prepare('SELECT * FROM task_project_positions').all(), originalPositions);

    // Simulate a failure after inserting a task but before saving its position.
    database.exec(`CREATE TRIGGER reject_position BEFORE INSERT ON task_project_positions
      BEGIN SELECT RAISE(ABORT, 'Position write failed'); END;`);
    assert.throws(() => ordering.create(1, 'Rejected', 'High'), /Position write failed/);
    assert.deepEqual(database.prepare('SELECT * FROM tasks').all(), originalTasks);
    assert.deepEqual(database.prepare('SELECT * FROM task_project_positions').all(), originalPositions);
    database.exec('DROP TRIGGER reject_position');
    ordering.create(1, 'Next', 'Low');
    assert.equal(database.prepare("SELECT position FROM tasks WHERE title = 'Next'").get().position, 2);
  } finally {
    database.close();
  }
});
