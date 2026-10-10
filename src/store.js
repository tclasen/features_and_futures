import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeDueDate } from './due-date.js';

export function openWorkboardStore(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0),
      archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
      default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_task_priority IN ('Low', 'Normal', 'High'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL CHECK(length(trim(title)) > 0),
      completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
      priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High')),
      due_date TEXT DEFAULT NULL
    );
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id);
  `);
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1))');
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
    database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High'))");
  }
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
    database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK(default_task_priority IN ('Low', 'Normal', 'High'))");
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
    database.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT DEFAULT NULL');
  }
  const list = database.prepare(`
    SELECT projects.id, projects.name, projects.archived,
      COUNT(tasks.id) AS total_count, COALESCE(SUM(tasks.completed), 0) AS completed_count
    FROM projects LEFT JOIN tasks ON tasks.project_id = projects.id
    WHERE projects.archived = ?
    GROUP BY projects.id ORDER BY projects.id
  `);
  const find = database.prepare('SELECT id, name, archived, default_task_priority FROM projects WHERE id = ?');
  const setArchived = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const rename = database.prepare('UPDATE projects SET name = ? WHERE id = ? AND archived = 0');
  const setDefaultTaskPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ? AND archived = 0');
  const listTasks = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id');
  const insertTask = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
  const findTask = database.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?');
  const renameTask = database.prepare(`
    UPDATE tasks SET title = ? WHERE id = ? AND project_id = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);
  const updateTask = database.prepare(`
    UPDATE tasks SET completed = ? WHERE id = ? AND project_id = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);
  const setTaskPriority = database.prepare(`
    UPDATE tasks SET priority = ? WHERE id = ? AND project_id = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);
  const setTaskDueDate = database.prepare(`
    UPDATE tasks SET due_date = ? WHERE id = ? AND project_id = ?
      AND EXISTS (SELECT 1 FROM projects WHERE id = tasks.project_id AND archived = 0)
  `);

  return {
    list: (filter = 'Active') => list.all(filter === 'Archived' ? 1 : 0),
    find: (id) => find.get(id),
    setArchived: (id, archived) => setArchived.run(archived ? 1 : 0, id).changes > 0,
    create(name) {
      const trimmedName = name.trim();
      if (!trimmedName) return { error: 'Project name is required' };
      const result = insert.run(trimmedName);
      return { id: Number(result.lastInsertRowid), name: trimmedName };
    },
    rename(id, name) {
      const project = find.get(id);
      if (!project) return { error: 'Project not found', status: 404 };
      if (project.archived) return { error: 'Archived project cannot be changed', status: 409 };
      const trimmedName = name.trim();
      if (!trimmedName) return { error: 'Project name is required', status: 400 };
      rename.run(trimmedName, id);
      return { id, name: trimmedName };
    },
    setDefaultTaskPriority(id, priority) {
      const project = find.get(id);
      if (!project) return { error: 'Project not found', status: 404 };
      if (project.archived) return { error: 'Archived project cannot be changed', status: 409 };
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        return { error: 'Invalid task priority', status: 400 };
      }
      setDefaultTaskPriority.run(priority, id);
      return { id, default_task_priority: priority };
    },
    tasks: {
      list(projectId, filter = 'All', priorityFilter = 'All') {
        return listTasks.all(projectId).filter((task) =>
          (filter === 'All' || Boolean(task.completed) === (filter === 'Completed')) &&
          (priorityFilter === 'All' || task.priority === priorityFilter));
      },
      create(projectId, title) {
        const project = find.get(projectId);
        if (!project) return { error: 'Project not found' };
        if (project.archived) return { error: 'Archived project cannot be changed' };
        const trimmedTitle = title.trim();
        if (!trimmedTitle) return { error: 'Task title is required' };
        const result = insertTask.run(projectId, trimmedTitle, project.default_task_priority);
        return { id: Number(result.lastInsertRowid), title: trimmedTitle, completed: 0, priority: project.default_task_priority, due_date: null };
      },
      rename(projectId, taskId, title) {
        const project = find.get(projectId);
        if (!project || !findTask.get(taskId, projectId)) {
          return { error: 'Task not found', status: 404 };
        }
        if (project.archived) return { error: 'Archived project cannot be changed', status: 409 };
        const trimmedTitle = title.trim();
        if (!trimmedTitle) return { error: 'Task title is required', status: 400 };
        renameTask.run(trimmedTitle, taskId, projectId);
        return { id: taskId, title: trimmedTitle };
      },
      setCompleted(projectId, taskId, completed) {
        return updateTask.run(completed ? 1 : 0, taskId, projectId).changes > 0;
      },
      setPriority(projectId, taskId, priority) {
        const project = find.get(projectId);
        if (!project || !findTask.get(taskId, projectId)) {
          return { error: 'Task not found', status: 404 };
        }
        if (project.archived) return { error: 'Archived project cannot be changed', status: 409 };
        if (!['Low', 'Normal', 'High'].includes(priority)) {
          return { error: 'Invalid task priority', status: 400 };
        }
        setTaskPriority.run(priority, taskId, projectId);
        return { id: taskId, priority };
      },
      setDueDate(projectId, taskId, value) {
        const project = find.get(projectId);
        if (!project || !findTask.get(taskId, projectId)) {
          return { error: 'Task not found', status: 404 };
        }
        if (project.archived) return { error: 'Archived project cannot be changed', status: 409 };
        const dueDate = normalizeDueDate(value);
        if (dueDate === undefined) {
          return { error: 'Due date must be a valid YYYY-MM-DD date', status: 400 };
        }
        setTaskDueDate.run(dueDate, taskId, projectId);
        return { id: taskId, due_date: dueDate };
      },
    },
    close: () => database.close(),
  };
}
