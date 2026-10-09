import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openProjectStore(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
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
  const taskRecord = (task) => task && { ...task, completed: Boolean(task.completed) };

  return {
    list: () => list.all(),
    find: (id) => find.get(id),
    create(name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) throw new Error('Project name is required');
      return find.get(insert.run(trimmedName).lastInsertRowid);
    },
    listTasks: (projectId) => listTasks.all(projectId).map(taskRecord),
    createTask(projectId, title) {
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) throw new Error('Task title is required');
      const result = insertTask.run(projectId, trimmedTitle);
      return taskRecord(findTask.get(projectId, result.lastInsertRowid));
    },
    setTaskCompleted(projectId, taskId, completed) {
      if (typeof completed !== 'boolean') throw new Error('Completion must be a boolean');
      updateTask.run(Number(completed), projectId, taskId);
      return taskRecord(findTask.get(projectId, taskId));
    },
    close: () => database.close(),
  };
}
