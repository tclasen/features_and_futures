import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeDueDate } from './dates.js';

export function openProjectStore(path) {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec(`
    PRAGMA foreign_keys = ON;
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
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id);
  `);
  // Add archive state without replacing existing projects or their task IDs.
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
  }
  // Default both migrated and new tasks to Normal without changing task identity.
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
    database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))");
  }
  // Project defaults affect future tasks only; existing task priorities are untouched.
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_priority')) {
    database.exec("ALTER TABLE projects ADD COLUMN default_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_priority IN ('Low', 'Normal', 'High'))");
  }
  // Empty dates cover both migrated tasks and future tasks.
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
    database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
  }
  // Separate project-local order from identity so moved tasks append without new IDs.
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
    database.exec(`
      BEGIN;
      ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      UPDATE tasks SET position = id;
      COMMIT;
    `);
  }
  // Retain positions even while tasks belong elsewhere. Seed legacy current order.
  database.exec(`
    BEGIN;
    CREATE TABLE IF NOT EXISTS task_positions (
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      project_id INTEGER NOT NULL REFERENCES projects(id),
      position INTEGER NOT NULL,
      PRIMARY KEY (task_id, project_id),
      UNIQUE (project_id, position)
    );
    INSERT OR IGNORE INTO task_positions (task_id, project_id, position)
      SELECT id, project_id, position FROM tasks;
    COMMIT;
  `);

  function transaction(operation) {
    database.exec('BEGIN IMMEDIATE');
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
    SELECT p.id, p.name, p.archived, COUNT(t.id) AS total,
      COALESCE(SUM(t.completed), 0) AS completed
    FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.archived = ? GROUP BY p.id ORDER BY p.id
  `);
  const find = database.prepare('SELECT id, name, archived, default_priority FROM projects WHERE id = ?');
  const updateDefaultPriority = database.prepare('UPDATE projects SET default_priority = ? WHERE id = ? AND archived = 0');
  const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const updateName = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');

  const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
  const insertTask = database.prepare(`
    INSERT INTO tasks (project_id, title, priority, position)
    SELECT id, ?, default_priority,
      (SELECT COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = projects.id)
    FROM projects WHERE id = ? AND archived = 0
  `);
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const updateTaskTitle = database.prepare(`
    UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);

  const updateTaskPriority = database.prepare(`
    UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);

  const updateTaskDueDate = database.prepare(`
    UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);

  const rememberCreatedPosition = database.prepare(`
    INSERT INTO task_positions (task_id, project_id, position)
      SELECT id, project_id, position FROM tasks WHERE id = ?
  `);
  const eligibleMove = database.prepare(`
    SELECT id FROM tasks
    WHERE project_id = ? AND id = ? AND project_id != ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
      AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND archived = 0)
  `);
  const rememberDestination = database.prepare(`
    INSERT INTO task_positions (task_id, project_id, position)
    SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM task_positions WHERE project_id = ?
    ON CONFLICT (task_id, project_id) DO NOTHING
  `);
  const moveTask = database.prepare(`
    UPDATE tasks SET project_id = ?,
      position = (SELECT position FROM task_positions WHERE task_id = tasks.id AND project_id = ?)
    WHERE id = ?
  `);

  return {
    moveTask(projectId, taskId, destinationId) {
      if (!Number.isSafeInteger(destinationId) || destinationId < 1) return false;
      return transaction(() => {
        if (!eligibleMove.get(projectId, taskId, destinationId, destinationId)) return false;
        rememberDestination.run(taskId, destinationId, destinationId);
        return moveTask.run(destinationId, destinationId, taskId).changes > 0;
      });
    },
    list: (archived = false) => list.all(archived ? 1 : 0),
    setArchived: (id, archived) => updateArchive.run(archived ? 1 : 0, id).changes > 0,
    find: (id) => find.get(id),
    create(name) {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Project name is required');
      return Number(insert.run(trimmedName).lastInsertRowid);
    },
    rename(id, name) {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Project name is required');
      return updateName.run(trimmedName, id).changes > 0;
    },
    setDefaultTaskPriority(id, priority) {
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        throw new Error('Invalid task priority');
      }
      return updateDefaultPriority.run(priority, id).changes > 0;
    },
    listTasks: (projectId) => listTasks.all(projectId),
    createTask(projectId, title) {
      const project = find.get(projectId);
      if (!project) throw new Error('Project not found');
      if (project.archived) throw new Error('Archived project is read-only');
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error('Task title is required');
      return transaction(() => {
        const taskId = Number(insertTask.run(trimmedTitle, projectId).lastInsertRowid);
        rememberCreatedPosition.run(taskId);
        return taskId;
      });
    },
    renameTask(projectId, taskId, title) {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error('Task title is required');
      return updateTaskTitle.run(trimmedTitle, projectId, taskId).changes > 0;
    },
    setTaskPriority(projectId, taskId, priority) {
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        throw new Error('Invalid task priority');
      }
      return updateTaskPriority.run(priority, projectId, taskId).changes > 0;
    },
    setTaskDueDate(projectId, taskId, value) {
      const date = normalizeDueDate(value);
      return updateTaskDueDate.run(date, projectId, taskId).changes > 0;
    },
    setTaskCompleted(projectId, taskId, completed) {
      if (find.get(projectId)?.archived) return false;
      return updateTask.run(completed ? 1 : 0, projectId, taskId).changes > 0;
    },
    close: () => database.close(),
  };
}
