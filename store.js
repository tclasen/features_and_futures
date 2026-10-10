import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openProjectStore(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`
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
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id);
  `);
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
  }
  const list = database.prepare(`
    SELECT projects.id, projects.name, projects.archived,
      COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
    WHERE projects.archived = ?
    GROUP BY projects.id ORDER BY projects.id ASC
  `);
  const find = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const updateName = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
  const updateArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC');
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const updateTaskTitle = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');

  function requireActiveProject(projectId) {
    if (find.get(projectId)?.archived) {
      const error = new Error('Archived project');
      error.status = 409;
      throw error;
    }
  }

  return {
    list: (filter = 'active') => list.all(filter === 'archived' ? 1 : 0),
    find: (id) => find.get(id),
    setArchived: (id, archived) => updateArchived.run(archived ? 1 : 0, id).changes > 0,
    create(name) {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Project name is required');
      return Number(insert.run(trimmedName).lastInsertRowid);
    },
    rename(id, name) {
      requireActiveProject(id);
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Project name is required');
      return updateName.run(trimmedName, id).changes > 0;
    },
    listTasks(projectId, filter = 'all') {
      return listTasks.all(projectId).filter((task) =>
        filter === 'open' ? !task.completed : filter === 'completed' ? task.completed : true);
    },
    createTask(projectId, title) {
      requireActiveProject(projectId);
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error('Task title is required');
      return Number(insertTask.run(projectId, trimmedTitle).lastInsertRowid);
    },
    setTaskCompleted(projectId, taskId, completed) {
      requireActiveProject(projectId);
      return updateTask.run(completed ? 1 : 0, projectId, taskId).changes > 0;
    },
    renameTask(projectId, taskId, title) {
      requireActiveProject(projectId);
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error('Task title is required');
      return updateTaskTitle.run(trimmedTitle, projectId, taskId).changes > 0;
    },
    close: () => database.close(),
  };
}
