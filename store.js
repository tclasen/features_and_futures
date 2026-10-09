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
  // Upgrade existing project databases without changing IDs or task ownership.
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
  }
  const projectQuery = `SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS totalCount, COALESCE(SUM(tasks.completed), 0) AS completedCount
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id`;
  const list = database.prepare(`${projectQuery} GROUP BY projects.id ORDER BY projects.id`);
  const find = database.prepare(`${projectQuery} WHERE projects.id = ? GROUP BY projects.id`);
  const updateProject = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const projectData = (row) => row && { ...row, archived: Boolean(row.archived) };
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
    listProjects: () => list.all().map(projectData),
    getProject: (id) => projectData(find.get(id)),
    setProjectArchived(id, archived) {
      if (typeof archived !== 'boolean') {
        throw new TypeError('Archived must be a boolean');
      }
      updateProject.run(Number(archived), id);
      return projectData(find.get(id));
    },
    createProject(name) {
      if (typeof name !== 'string' || !name.trim()) {
        throw new TypeError('Project name is required');
      }
      const result = insert.run(name.trim());
      return projectData(find.get(result.lastInsertRowid));
    },
    close: () => database.close(),
  };
}
