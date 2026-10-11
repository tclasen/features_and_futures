import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { matchesSearch } from './search.js';
import { TASK_PRIORITIES } from './task-priorities.js';
import { normalizeDueDate } from './task-dates.js';

export function openProjects(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL CHECK(length(trim(title)) > 0),
      completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);
  `);
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
    database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))");
  }
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
    database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_task_priority IN ('Low', 'Normal', 'High'))");
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
    database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'notes')) {
    database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'deleted')) {
    database.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0, 1))');
  }
  // Legacy databases used tasks.position, or task IDs before movement existed.
  // Seed only current memberships; earlier moves cannot be reconstructed.
  const hasLegacyPosition = database.prepare('PRAGMA table_info(tasks)').all()
    .some((column) => column.name === 'position');
  database.exec(`
    BEGIN;
    CREATE TABLE IF NOT EXISTS task_project_positions (
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      project_id INTEGER NOT NULL REFERENCES projects(id),
      position INTEGER NOT NULL,
      PRIMARY KEY (task_id, project_id),
      UNIQUE (project_id, position)
    );
    INSERT INTO task_project_positions (task_id, project_id, position)
      SELECT id, project_id, ${hasLegacyPosition ? 'position' : 'id'} FROM tasks
      WHERE NOT EXISTS (
        SELECT 1 FROM task_project_positions
        WHERE task_id = tasks.id AND project_id = tasks.project_id
      );
    COMMIT;
  `);

  function transaction(operation) {
    database.exec('BEGIN');
    try {
      const result = operation();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
  const list = database.prepare(`
    SELECT projects.id, projects.name, projects.archived,
      COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id AND tasks.deleted = 0
    WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id
  `);
  const find = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
  const exportTasks = database.prepare(`
    SELECT title, completed, priority, due_date, notes, deleted FROM tasks
    JOIN task_project_positions AS ordering
      ON ordering.task_id = tasks.id AND ordering.project_id = tasks.project_id
    WHERE tasks.project_id = ? ORDER BY ordering.position, tasks.id
  `);
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const updateName = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
  const updateDefaultPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ? AND archived = 0');
  const listTasks = database.prepare(`
    SELECT tasks.id, title, completed, priority, due_date, notes, deleted FROM tasks
    JOIN task_project_positions AS ordering
      ON ordering.task_id = tasks.id AND ordering.project_id = tasks.project_id
    WHERE tasks.project_id = ? AND deleted = ? AND (? IS NULL OR completed = ?)
      AND (? IS NULL OR priority = ?)
      AND (? = '' OR due_date >= ?)
      AND (? = '' OR (due_date != '' AND due_date <= ?)) ORDER BY ordering.position, tasks.id
  `);
  const insertTask = database.prepare(`
    INSERT INTO tasks (project_id, title, priority)
    SELECT id, ?, default_task_priority FROM projects WHERE id = ? AND archived = 0
  `);
  const rememberPosition = database.prepare(`
    INSERT INTO task_project_positions (task_id, project_id, position)
    VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1
      FROM task_project_positions WHERE project_id = ?))
  `);
  const updateTask = database.prepare(`
    UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ? AND deleted = 0
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);
  const updateTaskTitle = database.prepare(`
    UPDATE tasks SET title = ? WHERE id = ? AND project_id = ? AND deleted = 0
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);
  const updateTaskPriority = database.prepare(`
    UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ? AND deleted = 0
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);
  const updateTaskDueDate = database.prepare(`
    UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ? AND deleted = 0
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);
  const updateTaskNotes = database.prepare(`
    UPDATE tasks SET notes = ? WHERE id = ? AND project_id = ? AND deleted = 0
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);
  const updateTaskDeleted = database.prepare(`
    UPDATE tasks SET deleted = ? WHERE id = ? AND project_id = ? AND deleted = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);
  const eligibleMove = database.prepare(`
    SELECT tasks.id FROM tasks
    JOIN projects AS source ON source.id = tasks.project_id
    JOIN projects AS destination ON destination.id = ?
    WHERE tasks.id = ? AND tasks.project_id = ? AND source.id != destination.id
      AND tasks.deleted = 0 AND source.archived = 0 AND destination.archived = 0
  `);
  const findPosition = database.prepare(`
    SELECT position FROM task_project_positions WHERE task_id = ? AND project_id = ?
  `);
  const moveTask = database.prepare('UPDATE tasks SET project_id = ? WHERE id = ?');

  return {
    list: (filter = 'Active', search = '') => list.all(filter === 'Archived' ? 1 : 0)
      .filter((project) => matchesSearch(project.name, search)),
    find: (id) => find.get(id),
    exportProject(id) {
      const project = find.get(id);
      if (!project) return null;
      return {
        format: 'workboard-project',
        version: 1,
        project: {
          name: project.name,
          archived: Boolean(project.archived),
          defaultPriority: project.default_task_priority,
          tasks: exportTasks.all(id).map((task) => ({
            title: task.title,
            completed: Boolean(task.completed),
            priority: task.priority,
            dueDate: task.due_date,
            // Textareas expose LF line breaks; normalize only the portable copy.
            notes: task.notes.replace(/\r\n?/g, '\n'),
            deleted: Boolean(task.deleted),
          })),
        },
      };
    },
    setArchived(id, archived) {
      return updateArchive.run(archived ? 1 : 0, id).changes > 0;
    },
    create(name) {
      const trimmedName = name.trim();
      if (!trimmedName) return false;
      insert.run(trimmedName);
      return true;
    },
    rename(id, name) {
      const trimmedName = name.trim();
      if (!trimmedName) return false;
      return updateName.run(trimmedName, id).changes > 0;
    },
    setDefaultTaskPriority(id, priority) {
      if (!TASK_PRIORITIES.includes(priority)) return false;
      return updateDefaultPriority.run(priority, id).changes > 0;
    },
    listTasks(projectId, filter = 'All', priorityFilter = 'All', dueRange = {}) {
      const completed = filter === 'Open' ? 0 : filter === 'Completed' ? 1 : null;
      const priority = TASK_PRIORITIES.includes(priorityFilter) ? priorityFilter : null;
      const { dueFrom = '', dueThrough = '', search = '' } = dueRange;
      return listTasks.all(projectId, filter === 'Deleted' ? 1 : 0, completed, completed, priority, priority,
        dueFrom, dueFrom, dueThrough, dueThrough)
        .filter((task) => matchesSearch(task.title, search));
    },
    createTask(projectId, title) {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) return false;
      return transaction(() => {
        const inserted = insertTask.run(trimmedTitle, projectId);
        if (!inserted.changes) return false;
        rememberPosition.run(inserted.lastInsertRowid, projectId, projectId);
        return true;
      });
    },
    setTaskCompleted(projectId, taskId, completed) {
      return updateTask.run(completed ? 1 : 0, taskId, projectId).changes > 0;
    },
    renameTask(projectId, taskId, title) {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) return false;
      return updateTaskTitle.run(trimmedTitle, taskId, projectId).changes > 0;
    },
    setTaskPriority(projectId, taskId, priority) {
      if (!TASK_PRIORITIES.includes(priority)) return false;
      return updateTaskPriority.run(priority, taskId, projectId).changes > 0;
    },
    setTaskDueDate(projectId, taskId, value) {
      const date = normalizeDueDate(value);
      if (date === null) return false;
      return updateTaskDueDate.run(date, taskId, projectId).changes > 0;
    },
    setTaskNotes(projectId, taskId, notes) {
      return updateTaskNotes.run(notes, taskId, projectId).changes > 0;
    },
    setTaskDeleted(projectId, taskId, deleted) {
      // Only the flag changes: ownership, fields and all reserved positions remain.
      return updateTaskDeleted.run(deleted ? 1 : 0, taskId, projectId, deleted ? 0 : 1).changes > 0;
    },
    moveTask(projectId, taskId, destinationId) {
      if (!Number.isSafeInteger(destinationId) || destinationId < 1) return false;
      return transaction(() => {
        if (!eligibleMove.get(destinationId, taskId, projectId)) return false;
        if (!findPosition.get(taskId, destinationId)) {
          rememberPosition.run(taskId, destinationId, destinationId);
        }
        moveTask.run(destinationId, taskId);
        return true;
      });
    },
    close: () => database.close(),
  };
}
