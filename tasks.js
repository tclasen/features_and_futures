import { normalizeDueDate } from './public/dates.js';

export { normalizeDueDate } from './public/dates.js';

export function createTaskStore(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks(project_id, id);
  `);
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'priority')) {
    database.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High'))");
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'due_date')) {
    database.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'position')) {
    // Legacy ID order becomes explicit order; moving never changes task identity.
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
      UPDATE tasks SET position = id;
      COMMIT;
    `);
  }
  const list = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY position, id');
  const get = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? AND id = ?');
  const insert = database.prepare(`INSERT INTO tasks (project_id, title, priority, position)
    VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?))`);
  const getProject = database.prepare('SELECT * FROM projects WHERE id = ?');
  const move = database.prepare(`UPDATE tasks SET project_id = ?,
    position = (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = ?)
    WHERE project_id = ? AND id = ?`);
  const update = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const updateTitle = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
  const updatePriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
  const updateDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
  const taskValue = (row) => row ? { ...row, completed: Boolean(row.completed) } : undefined;

  return {
    list: (projectId) => list.all(projectId).map(taskValue),
    create(projectId, title, priority = 'Normal') {
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) throw new Error('Task title is required');
      return taskValue(get.get(projectId, insert.run(projectId, trimmedTitle, priority, projectId).lastInsertRowid));
    },
    move(projectId, taskId, destinationProjectId) {
      const fail = (status, message) => {
        const error = new Error(message);
        error.status = status;
        throw error;
      };
      if (!Number.isSafeInteger(destinationProjectId) || destinationProjectId < 1) {
        fail(400, 'Destination project must be a valid project ID');
      }
      database.exec('BEGIN IMMEDIATE');
      try {
        const source = getProject.get(projectId);
        const destination = getProject.get(destinationProjectId);
        if (!source || !destination) fail(404, 'Project not found');
        if (source.archived || destination.archived) fail(409, 'Archived projects cannot move tasks');
        if (source.id === destination.id) fail(400, 'Destination must be another project');
        if (!get.get(projectId, taskId)) fail(404, 'Task not found');
        move.run(destinationProjectId, destinationProjectId, projectId, taskId);
        const task = taskValue(get.get(destinationProjectId, taskId));
        database.exec('COMMIT');
        return task;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    setCompleted(projectId, taskId, completed) {
      if (typeof completed !== 'boolean') throw new Error('Completion must be a boolean');
      update.run(Number(completed), projectId, taskId);
      return taskValue(get.get(projectId, taskId));
    },
    setDueDate(projectId, taskId, dueDate) {
      const date = normalizeDueDate(dueDate);
      updateDueDate.run(date, projectId, taskId);
      return taskValue(get.get(projectId, taskId));
    },
    setPriority(projectId, taskId, priority) {
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        const error = new Error('Task priority must be Low, Normal, or High');
        error.status = 400;
        throw error;
      }
      updatePriority.run(priority, projectId, taskId);
      return taskValue(get.get(projectId, taskId));
    },
    rename(projectId, taskId, title) {
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) {
        const error = new Error('Task title is required');
        error.status = 400;
        throw error;
      }
      updateTitle.run(trimmedTitle, projectId, taskId);
      return taskValue(get.get(projectId, taskId));
    },
  };
}
