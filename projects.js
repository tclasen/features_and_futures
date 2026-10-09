import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openProjects(databasePath) {
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
  const projectQuery = `SELECT projects.id, projects.name, projects.archived,
    COUNT(tasks.id) AS totalCount, COALESCE(SUM(tasks.completed), 0) AS completedCount
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id`;
  const list = database.prepare(`${projectQuery} GROUP BY projects.id ORDER BY projects.id`);
  const find = database.prepare(`${projectQuery} WHERE projects.id = ? GROUP BY projects.id`);
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const updateName = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
  const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const listTasks = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? ORDER BY id');
  const findTask = database.prepare('SELECT id, title, completed FROM tasks WHERE project_id = ? AND id = ?');
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const updateTaskTitle = database.prepare(`UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?
    AND EXISTS (SELECT 1 FROM projects WHERE id = ? AND archived = 0)`);
  const taskValue = (task) => task ? { ...task, completed: Boolean(task.completed) } : null;
  const projectValue = (project) => project ? { ...project, archived: Boolean(project.archived) } : null;

  return {
    list: () => list.all().map(projectValue),
    find: (id) => projectValue(find.get(id)),
    create(name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return null;
      const result = insert.run(trimmedName);
      return projectValue(find.get(result.lastInsertRowid));
    },
    rename(id, name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return null;
      const result = updateName.run(trimmedName, id);
      return result.changes ? projectValue(find.get(id)) : null;
    },
    setArchived(id, archived) {
      updateArchive.run(Number(archived), id);
      return projectValue(find.get(id));
    },
    listTasks: (projectId) => listTasks.all(projectId).map(taskValue),
    createTask(projectId, title) {
      const project = find.get(projectId);
      if (!project || project.archived) return null;
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) return null;
      const result = insertTask.run(projectId, trimmedTitle);
      return taskValue(findTask.get(projectId, result.lastInsertRowid));
    },
    renameTask(projectId, taskId, title) {
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) return null;
      const result = updateTaskTitle.run(trimmedTitle, projectId, taskId, projectId);
      return result.changes ? taskValue(findTask.get(projectId, taskId)) : null;
    },
    setTaskCompleted(projectId, taskId, completed) {
      const project = find.get(projectId);
      if (!project || project.archived) return null;
      updateTask.run(Number(completed), projectId, taskId);
      return taskValue(findTask.get(projectId, taskId));
    },
    close: () => database.close(),
  };
}
