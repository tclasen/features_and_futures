import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openStore(path) {
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
  const list = database.prepare('SELECT id, name FROM projects ORDER BY id');
  const find = database.prepare('SELECT id, name FROM projects WHERE id = ?');
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');

  const listTasks = database.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
  const findTask = database.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const taskData = (row) => row && { ...row, completed: Boolean(row.completed) };

  return {
    listTasks: (projectId) => listTasks.all(projectId).map(taskData),
    createTask(projectId, title) {
      if (typeof title !== 'string' || !title.trim()) {
        throw new TypeError('Task title is required');
      }
      const result = insertTask.run(projectId, title.trim());
      return taskData(findTask.get(projectId, result.lastInsertRowid));
    },
    setTaskCompleted(projectId, taskId, completed) {
      if (typeof completed !== 'boolean') {
        throw new TypeError('Completed must be a boolean');
      }
      updateTask.run(Number(completed), projectId, taskId);
      return taskData(findTask.get(projectId, taskId));
    },
    listProjects: () => list.all(),
    getProject: (id) => find.get(id),
    createProject(name) {
      if (typeof name !== 'string' || !name.trim()) {
        throw new TypeError('Project name is required');
      }
      const result = insert.run(name.trim());
      return find.get(result.lastInsertRowid);
    },
    close: () => database.close(),
  };
}
