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
  const list = database.prepare('SELECT id, name FROM projects ORDER BY id ASC');
  const find = database.prepare('SELECT id, name FROM projects WHERE id = ?');
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id ASC');
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');

  return {
    list: () => list.all(),
    find: (id) => find.get(id),
    create(name) {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Project name is required');
      return Number(insert.run(trimmedName).lastInsertRowid);
    },
    listTasks(projectId, filter = 'all') {
      return listTasks.all(projectId).filter((task) =>
        filter === 'open' ? !task.completed : filter === 'completed' ? task.completed : true);
    },
    createTask(projectId, title) {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error('Task title is required');
      return Number(insertTask.run(projectId, trimmedTitle).lastInsertRowid);
    },
    setTaskCompleted(projectId, taskId, completed) {
      return updateTask.run(completed ? 1 : 0, projectId, taskId).changes > 0;
    },
    close: () => database.close(),
  };
}
