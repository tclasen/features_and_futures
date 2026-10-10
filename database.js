import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeDueDate, matchesDueRange } from './due-date.js';

export function openWorkboard(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      default_task_priority TEXT NOT NULL DEFAULT 'normal' CHECK (default_task_priority IN ('low', 'normal', 'high'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
      due_date TEXT NOT NULL DEFAULT '',
      sort_position INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);
  `);
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
    database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high'))");
  }
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
    database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'normal' CHECK (default_task_priority IN ('low', 'normal', 'high'))");
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
    database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'sort_position')) {
    // Preserve the previous ID order when upgrading existing tasks.
    database.exec(`BEGIN;
      ALTER TABLE tasks ADD COLUMN sort_position INTEGER NOT NULL DEFAULT 0;
      UPDATE tasks SET sort_position = id;
      COMMIT;`);
  }
  // Keep departed tasks' positions reserved. sort_position is the current
  // project's position; this table remembers it for every visited project.
  database.exec(`BEGIN;
    CREATE TABLE IF NOT EXISTS task_project_positions (
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      project_id INTEGER NOT NULL REFERENCES projects(id),
      position INTEGER NOT NULL,
      PRIMARY KEY (task_id, project_id)
    );
    CREATE INDEX IF NOT EXISTS task_positions_project ON task_project_positions(project_id, position);
    INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
      SELECT id, project_id, sort_position FROM tasks;
    COMMIT;`);

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
    SELECT projects.id, projects.name, projects.archived,
      COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
    WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id
  `);
  const find = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
  const updateArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const updateName = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
  const updateDefaultPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ? AND archived = 0');
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY sort_position, id');
  const insertTask = database.prepare(`INSERT INTO tasks (project_id, title, priority, sort_position)
    VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?))`);
  const rememberCreatedTask = database.prepare(`INSERT INTO task_project_positions (task_id, project_id, position)
    SELECT id, project_id, sort_position FROM tasks WHERE id = ?`);
  const eligibleMove = database.prepare(`SELECT tasks.id FROM tasks
    JOIN projects source ON source.id = tasks.project_id
    JOIN projects destination ON destination.id = ?
    WHERE tasks.project_id = ? AND tasks.id = ? AND source.id != destination.id
      AND source.archived = 0 AND destination.archived = 0`);
  const rememberDestination = database.prepare(`INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
    VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?))`);
  const moveTask = database.prepare(`UPDATE tasks SET project_id = ?,
    sort_position = (SELECT position FROM task_project_positions WHERE task_id = tasks.id AND project_id = ?)
    WHERE project_id = ? AND id = ? AND project_id != ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
      AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND archived = 0)`);
  const updateTask = database.prepare(`UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?
    AND EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND archived = 0)`);
  const renameTask = database.prepare(`UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?
    AND EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND archived = 0)`);
  const updatePriority = database.prepare(`UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?
    AND EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND archived = 0)`);
  const updateDueDate = database.prepare(`UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?
    AND EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND archived = 0)`);

  return {
    list: (filter = 'active') => list.all(filter === 'archived' ? 1 : 0),
    find: (id) => find.get(id),
    setArchived: (id, archived) => updateArchived.run(archived ? 1 : 0, id).changes > 0,
    setDefaultPriority(id, priority) {
      if (!['low', 'normal', 'high'].includes(priority)) return false;
      return updateDefaultPriority.run(priority, id).changes > 0;
    },
    rename(id, name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return false;
      return updateName.run(trimmedName, id).changes > 0;
    },
    create(name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return null;
      const result = insert.run(trimmedName);
      return { id: Number(result.lastInsertRowid), name: trimmedName };
    },
    tasks: {
      list(projectId, filter = 'all', priorityFilter = 'all', dueRange = {}) {
        return listTasks.all(projectId).filter((task) => (
          filter === 'open' ? !task.completed : filter === 'completed' ? task.completed : true
        ) && (priorityFilter === 'all' || task.priority === priorityFilter)
          && matchesDueRange(task.due_date, dueRange));
      },
      create(projectId, title) {
        const project = find.get(projectId);
        if (project?.archived) return null;
        const trimmedTitle = typeof title === 'string' ? title.trim() : '';
        if (!trimmedTitle) return null;
        const priority = project?.default_task_priority ?? 'normal';
        const result = transaction(() => {
          const created = insertTask.run(projectId, trimmedTitle, priority, projectId);
          rememberCreatedTask.run(created.lastInsertRowid);
          return created;
        });
        return { id: Number(result.lastInsertRowid), title: trimmedTitle, completed: 0, priority, due_date: '' };
      },
      setCompleted(projectId, taskId, completed) {
        return updateTask.run(completed ? 1 : 0, projectId, taskId).changes > 0;
      },
      rename(projectId, taskId, title) {
        const trimmedTitle = typeof title === 'string' ? title.trim() : '';
        if (!trimmedTitle) return false;
        return renameTask.run(trimmedTitle, projectId, taskId).changes > 0;
      },
      setPriority(projectId, taskId, priority) {
        if (!['low', 'normal', 'high'].includes(priority)) return false;
        return updatePriority.run(priority, projectId, taskId).changes > 0;
      },
      setDueDate(projectId, taskId, value) {
        const date = normalizeDueDate(value);
        if (date === null) return false;
        return updateDueDate.run(date, projectId, taskId).changes > 0;
      },
      move(projectId, taskId, destinationId) {
        if (!Number.isSafeInteger(destinationId) || destinationId <= 0) return false;
        return transaction(() => {
          if (!eligibleMove.get(destinationId, projectId, taskId)) return false;
          rememberDestination.run(taskId, destinationId, destinationId);
          return moveTask.run(destinationId, destinationId, projectId, taskId, destinationId, destinationId).changes > 0;
        });
      },
    },
    close: () => database.close(),
  };
}
