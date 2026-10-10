import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openWorkboard(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high'))
    );
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id);
  `);
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
    database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high'))");
  }
  const list = database.prepare(`
    SELECT projects.id, projects.name, projects.archived,
      COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
    WHERE projects.archived = ? GROUP BY projects.id ORDER BY projects.id
  `);
  const find = database.prepare('SELECT id, name, archived FROM projects WHERE id = ?');
  const updateArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const updateName = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const listTasks = database.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const updateTask = database.prepare(`UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?
    AND EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND archived = 0)`);
  const renameTask = database.prepare(`UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?
    AND EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND archived = 0)`);
  const updatePriority = database.prepare(`UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?
    AND EXISTS (SELECT 1 FROM projects WHERE projects.id = tasks.project_id AND archived = 0)`);

  return {
    list: (filter = 'active') => list.all(filter === 'archived' ? 1 : 0),
    find: (id) => find.get(id),
    setArchived: (id, archived) => updateArchived.run(archived ? 1 : 0, id).changes > 0,
    rename(id, name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return false;
      return updateName.run(trimmedName, id).changes > 0;
    },
    create(name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return null;
      const result = insert.run(trimmedName);
      return { id: Number(result.lastInsertRowid), name: trimmedName };
    },
    tasks: {
      list(projectId, filter = 'all', priorityFilter = 'all') {
        return listTasks.all(projectId).filter((task) => (
          filter === 'open' ? !task.completed : filter === 'completed' ? task.completed : true
        ) && (priorityFilter === 'all' || task.priority === priorityFilter));
      },
      create(projectId, title) {
        if (find.get(projectId)?.archived) return null;
        const trimmedTitle = typeof title === 'string' ? title.trim() : '';
        if (!trimmedTitle) return null;
        const result = insertTask.run(projectId, trimmedTitle);
        return { id: Number(result.lastInsertRowid), title: trimmedTitle, completed: 0, priority: 'normal' };
      },
      setCompleted(projectId, taskId, completed) {
        return updateTask.run(completed ? 1 : 0, projectId, taskId).changes > 0;
      },
      rename(projectId, taskId, title) {
        const trimmedTitle = typeof title === 'string' ? title.trim() : '';
        if (!trimmedTitle) return false;
        return renameTask.run(trimmedTitle, projectId, taskId).changes > 0;
      },
      setPriority(projectId, taskId, priority) {
        if (!['low', 'normal', 'high'].includes(priority)) return false;
        return updatePriority.run(priority, projectId, taskId).changes > 0;
      },
    },
    close: () => database.close(),
  };
}
