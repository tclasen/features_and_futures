import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeDueDate } from './public/task-due-date.js';

export function openProjectStore(path) {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
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
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id);
  `);
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'archived')) {
    database.exec('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))');
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
    database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
  }
  if (!database.prepare('PRAGMA table_info(projects)').all().some((column) => column.name === 'default_task_priority')) {
    database.exec("ALTER TABLE projects ADD COLUMN default_task_priority TEXT NOT NULL DEFAULT 'Normal' CHECK (default_task_priority IN ('Low', 'Normal', 'High'))");
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
    database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      UPDATE tasks SET position = id;
      COMMIT;
    `);
  }
  const projectQuery = `SELECT id, name, archived, default_task_priority AS defaultTaskPriority,
    (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id) AS totalCount,
    (SELECT COUNT(*) FROM tasks WHERE project_id = projects.id AND completed = 1) AS completedCount
    FROM projects`;
  const list = database.prepare(`${projectQuery} ORDER BY id`);
  const find = database.prepare(`${projectQuery} WHERE id = ?`);
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');
  const updateArchive = database.prepare('UPDATE projects SET archived = ? WHERE id = ?');
  const updateName = database.prepare('UPDATE projects SET name = ? WHERE id = ?');
  const updateDefaultTaskPriority = database.prepare('UPDATE projects SET default_task_priority = ? WHERE id = ?');
  const listTasks = database.prepare('SELECT id, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? ORDER BY position, id');
  const findTask = database.prepare('SELECT id, title, completed, priority, due_date AS dueDate FROM tasks WHERE project_id = ? AND id = ?');
  const insertTask = database.prepare(`INSERT INTO tasks (project_id, title, priority, position)
    VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?))`);
  const moveTask = database.prepare(`UPDATE tasks SET project_id = ?,
    position = (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?)
    WHERE project_id = ? AND id = ?`);
  const updateTask = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const updateTaskTitle = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
  const updateTaskPriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
  const updateTaskDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
  const taskRecord = (task) => task && { ...task, completed: Boolean(task.completed) };
  const projectRecord = (project) => project && { ...project, archived: Boolean(project.archived) };

  function requireActiveProject(projectId) {
    const project = find.get(projectId);
    if (!project || project.archived) {
      const error = new Error(project ? 'Archived projects cannot be changed' : 'Project not found');
      error.status = project ? 409 : 404;
      throw error;
    }
    return project;
  }

  return {
    list: () => list.all().map(projectRecord),
    find: (id) => projectRecord(find.get(id)),
    create(name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) {
        throw new Error('Project name is required');
      }
      return projectRecord(find.get(insert.run(trimmedName).lastInsertRowid));
    },
    setArchived(id, archived) {
      if (typeof archived !== 'boolean') throw new Error('Project archive state must be a boolean');
      updateArchive.run(Number(archived), id);
      return projectRecord(find.get(id));
    },
    rename(id, name) {
      requireActiveProject(id);
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) {
        const error = new Error('Project name is required');
        error.status = 400;
        throw error;
      }
      updateName.run(trimmedName, id);
      return projectRecord(find.get(id));
    },
    listTasks: (projectId) => listTasks.all(projectId).map(taskRecord),
    setDefaultTaskPriority(projectId, priority) {
      requireActiveProject(projectId);
      validatePriority(priority);
      updateDefaultTaskPriority.run(priority, projectId);
      return projectRecord(find.get(projectId));
    },
    createTask(projectId, title) {
      const project = requireActiveProject(projectId);
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) throw new Error('Task title is required');
      const result = insertTask.run(projectId, trimmedTitle, project.defaultTaskPriority, projectId);
      return taskRecord(findTask.get(projectId, result.lastInsertRowid));
    },
    moveTask(projectId, taskId, destinationProjectId) {
      if (!Number.isSafeInteger(destinationProjectId) || destinationProjectId < 1 ||
          destinationProjectId === Number(projectId)) {
        const error = new Error('Destination must be another active project');
        error.status = 400;
        throw error;
      }
      database.exec('BEGIN IMMEDIATE');
      try {
        requireActiveProject(projectId);
        requireActiveProject(destinationProjectId);
        const task = findTask.get(projectId, taskId);
        if (!task) {
          const error = new Error('Task not found');
          error.status = 404;
          throw error;
        }
        moveTask.run(destinationProjectId, destinationProjectId, projectId, taskId);
        database.exec('COMMIT');
        return taskRecord(task);
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    setTaskCompletion(projectId, taskId, completed) {
      requireActiveProject(projectId);
      if (typeof completed !== 'boolean') throw new Error('Task completion must be a boolean');
      updateTask.run(Number(completed), projectId, taskId);
      return taskRecord(findTask.get(projectId, taskId));
    },
    renameTask(projectId, taskId, title) {
      requireActiveProject(projectId);
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) {
        const error = new Error('Task title is required');
        error.status = 400;
        throw error;
      }
      updateTaskTitle.run(trimmedTitle, projectId, taskId);
      return taskRecord(findTask.get(projectId, taskId));
    },
    setTaskPriority(projectId, taskId, priority) {
      requireActiveProject(projectId);
      validatePriority(priority);
      updateTaskPriority.run(priority, projectId, taskId);
      return taskRecord(findTask.get(projectId, taskId));
    },
    setTaskDueDate(projectId, taskId, dueDate) {
      requireActiveProject(projectId);
      const normalized = normalizeDueDate(dueDate);
      updateTaskDueDate.run(normalized, projectId, taskId);
      return taskRecord(findTask.get(projectId, taskId));
    },
    close: () => database.close(),
  };
}

function validatePriority(priority) {
  if (!['Low', 'Normal', 'High'].includes(priority)) {
    const error = new Error('Task priority must be Low, Normal, or High');
    error.status = 400;
    throw error;
  }
}
