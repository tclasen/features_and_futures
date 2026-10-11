import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
    // Existing IDs already represent each project's creation order.
    database.exec(`
      BEGIN;
      ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      UPDATE tasks SET position = id;
      COMMIT;
    `);
  }
  const list = database.prepare(`
    SELECT projects.id, projects.name, projects.archived,
      COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
    WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id
  `);
  const find = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const updateName = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
  const updateDefaultPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ? AND archived = 0');
  const listTasks = database.prepare(`
    SELECT id, title, completed, priority, due_date FROM tasks
    WHERE project_id = ? AND (? IS NULL OR completed = ?)
      AND (? IS NULL OR priority = ?)
      AND (? = '' OR due_date >= ?)
      AND (? = '' OR (due_date != '' AND due_date <= ?)) ORDER BY position, id
  `);
  const insertTask = database.prepare(`
    INSERT INTO tasks (project_id, title, priority, position)
    SELECT id, ?, default_task_priority,
      (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = projects.id)
    FROM projects WHERE id = ? AND archived = 0
  `);
  const updateTask = database.prepare(`
    UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);
  const updateTaskTitle = database.prepare(`
    UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);
  const updateTaskPriority = database.prepare(`
    UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);
  const updateTaskDueDate = database.prepare(`
    UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);
  const moveTask = database.prepare(`
    UPDATE tasks SET project_id = ?,
      position = (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?)
    WHERE id = ? AND project_id = ? AND project_id != ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
      AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND archived = 0)
  `);

  return {
    list: (filter = 'Active') => list.all(filter === 'Archived' ? 1 : 0),
    find: (id) => find.get(id),
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
      const { dueFrom = '', dueThrough = '' } = dueRange;
      return listTasks.all(projectId, completed, completed, priority, priority,
        dueFrom, dueFrom, dueThrough, dueThrough);
    },
    createTask(projectId, title) {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) return false;
      return insertTask.run(trimmedTitle, projectId).changes > 0;
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
    moveTask(projectId, taskId, destinationId) {
      if (!Number.isSafeInteger(destinationId) || destinationId < 1) return false;
      return moveTask.run(destinationId, destinationId, taskId, projectId,
        destinationId, destinationId).changes > 0;
    },
    close: () => database.close(),
  };
}
