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
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
  }
  const projectQuery = `
    SELECT projects.id, projects.name, projects.archived,
      COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
  `;
  const list = database.prepare(`${projectQuery} GROUP BY projects.id ORDER BY projects.id`);
  const find = database.prepare(`${projectQuery} WHERE projects.id = ? GROUP BY projects.id`);
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const listTasks = database.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
  const findTask = database.prepare('SELECT id, project_id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const taskRecord = (task) => task && { ...task, completed: Boolean(task.completed) };
  const projectRecord = (project) => project && { ...project, archived: Boolean(project.archived) };
  function requireEditable(projectId) {
    if (find.get(projectId)?.archived) throw new Error('Archived projects cannot be edited');
  }

  return {
    list: () => list.all().map(projectRecord),
    find: (id) => projectRecord(find.get(id)),
    create(name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) throw new Error('Project name is required');
      return projectRecord(find.get(insert.run(trimmedName).lastInsertRowid));
    },
    setArchived(id, archived) {
      if (typeof archived !== 'boolean') throw new Error('Archive state must be a boolean');
      updateArchive.run(Number(archived), id);
      return projectRecord(find.get(id));
    },
    listTasks: (projectId) => listTasks.all(projectId).map(taskRecord),
    createTask(projectId, title) {
      requireEditable(projectId);
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) throw new Error('Task title is required');
      const result = insertTask.run(projectId, trimmedTitle);
      return taskRecord(findTask.get(projectId, result.lastInsertRowid));
    },
    setTaskCompleted(projectId, taskId, completed) {
      requireEditable(projectId);
      if (typeof completed !== 'boolean') throw new Error('Completion must be a boolean');
      updateTask.run(Number(completed), projectId, taskId);
      return taskRecord(findTask.get(projectId, taskId));
    },
    close: () => database.close(),
  };
}
