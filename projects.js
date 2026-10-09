import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openProjects(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);
  `);
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
  }
  const list = database.prepare(`
    SELECT projects.id, projects.name, projects.archived,
      COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
    WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id
  `);
  const find = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const archiveUpdate = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const renameUpdate = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
  const taskList = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
  const taskInsert = database.prepare('INSERT INTO tasks (project_id, title) SELECT id, ? FROM projects WHERE id = ? AND archived = 0');
  const taskUpdate = database.prepare(`UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?
    AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)`);

  return {
    list: (archived = false) => list.all(archived ? 1 : 0),
    find: (id) => find.get(id),
    setArchived: (id, archived) => archiveUpdate.run(archived ? 1 : 0, id).changes === 1,
    create(name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return null;
      const result = insert.run(trimmedName);
      return find.get(result.lastInsertRowid);
    },
    rename(id, name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return false;
      return renameUpdate.run(trimmedName, id).changes === 1;
    },
    listTasks: (projectId) => taskList.all(projectId),
    createTask(projectId, title) {
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) return null;
      const result = taskInsert.run(trimmedTitle, projectId);
      return result.changes === 1 ? Number(result.lastInsertRowid) : null;
    },
    setTaskCompleted(projectId, taskId, completed) {
      return taskUpdate.run(completed ? 1 : 0, projectId, taskId).changes === 1;
    },
    close: () => database.close(),
  };
}
