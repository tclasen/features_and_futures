import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createTaskStore } from './tasks.js';

export function openProjects(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0)
    )
  `);
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
  }
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
    database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
  }
  const tasks = createTaskStore(database);
  const projectFields = `SELECT id, name, archived, default_task_priority,
    (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id) AS total_count,
    (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id AND completed = 1) AS completed_count
    FROM projects`;
  const list = database.prepare(`${projectFields} ORDER BY id`);
  const get = database.prepare(`${projectFields} WHERE id = ?`);
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const updateName = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
  const updateDefaultPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
  const projectValue = (row) => row ? { ...row, archived: Boolean(row.archived) } : undefined;

  return {
    tasks,
    list: () => list.all().map(projectValue),
    get: (id) => projectValue(get.get(id)),
    create(name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) throw new Error('Project name is required');
      return projectValue(get.get(insert.run(trimmedName).lastInsertRowid));
    },
    setArchived(id, archived) {
      if (typeof archived !== 'boolean') throw new Error('Archive state must be a boolean');
      updateArchive.run(Number(archived), id);
      return projectValue(get.get(id));
    },
    setDefaultPriority(id, priority) {
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        const error = new Error('Default task priority must be Low, Normal, or High');
        error.status = 400;
        throw error;
      }
      const project = get.get(id);
      if (!project) return undefined;
      if (project.archived) {
        const error = new Error('Archived project cannot be changed');
        error.status = 409;
        throw error;
      }
      updateDefaultPriority.run(priority, id);
      return projectValue(get.get(id));
    },
    rename(id, name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) {
        const error = new Error('Project name is required');
        error.status = 400;
        throw error;
      }
      const project = get.get(id);
      if (!project) return undefined;
      if (project.archived) {
        const error = new Error('Archived project cannot be changed');
        error.status = 409;
        throw error;
      }
      updateName.run(trimmedName, id);
      return projectValue(get.get(id));
    },
    close: () => database.close(),
  };
}
