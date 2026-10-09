import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openProjectStore(path) {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id)
  `);
  // Existing pilot databases predate archive state; preserve their IDs and tasks.
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
  }
  const list = database.prepare(`
    SELECT projects.id, projects.name, projects.archived,
      COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
    WHERE projects.archived = ?
    GROUP BY projects.id ORDER BY projects.id
  `);
  const find = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const updateArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
  const insertTask = database.prepare(`
    INSERT INTO tasks (project_id, title)
    SELECT id, ? FROM projects WHERE id = ? AND archived = 0
  `);
  const updateTask = database.prepare(`
    UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);

  return {
    list: (archived = false) => list.all(archived ? 1 : 0),
    find: (id) => find.get(id),
    create(name) {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Project name is required');
      return insert.run(trimmedName).lastInsertRowid;
    },
    listTasks: (projectId) => listTasks.all(projectId),
    setArchived(projectId, archived) {
      return updateArchived.run(archived ? 1 : 0, projectId).changes > 0;
    },
    createTask(projectId, title) {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error('Task title is required');
      const result = insertTask.run(trimmedTitle, projectId);
      return result.changes ? result.lastInsertRowid : undefined;
    },
    setTaskCompleted(projectId, taskId, completed) {
      return updateTask.run(completed ? 1 : 0, projectId, taskId).changes > 0;
    },
    close: () => database.close(),
  };
}
