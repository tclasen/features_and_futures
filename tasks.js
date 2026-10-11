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
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'notes')) {
    database.exec("ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
  }
  if (!database.prepare('PRAGMA table_info(tasks)').all().some((column) => column.name === 'deleted')) {
    database.exec('ALTER TABLE tasks ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))');
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
  // tasks.position is the current position; history reserves positions even while
  // tasks are elsewhere. Seed only missing history to preserve existing order.
  database.exec(`
    CREATE TABLE IF NOT EXISTS task_project_positions (
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      project_id INTEGER NOT NULL REFERENCES projects(id),
      position INTEGER NOT NULL,
      PRIMARY KEY (task_id, project_id),
      UNIQUE (project_id, position)
    );
    INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
      SELECT id, project_id, position FROM tasks;
  `);
  const list = database.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? ORDER BY position, id');
  const get = database.prepare('SELECT id, title, completed, priority, due_date, notes, deleted FROM tasks WHERE project_id = ? AND id = ?');
  const insert = database.prepare(`INSERT INTO tasks (project_id, title, priority, position)
    VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?))`);
  const rememberCreatedPosition = database.prepare(`INSERT INTO task_project_positions (task_id, project_id, position)
    SELECT id, project_id, position FROM tasks WHERE id = ?`);
  const rememberDestinationPosition = database.prepare(`INSERT INTO task_project_positions (task_id, project_id, position)
    VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM task_project_positions WHERE project_id = ?))
    ON CONFLICT (task_id, project_id) DO NOTHING`);
  const getProject = database.prepare('SELECT * FROM projects WHERE id = ?');
  const move = database.prepare(`UPDATE tasks SET project_id = ?,
    position = (SELECT position FROM task_project_positions WHERE project_id = ? AND task_id = ?)
    WHERE project_id = ? AND id = ?`);
  const update = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const updateTitle = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
  const updatePriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
  const updateDueDate = database.prepare('UPDATE tasks SET due_date = ? WHERE project_id = ? AND id = ?');
  const updateNotes = database.prepare('UPDATE tasks SET notes = ? WHERE project_id = ? AND id = ?');
  const updateDeleted = database.prepare('UPDATE tasks SET deleted = ? WHERE project_id = ? AND id = ?');
  const taskValue = (row) => row ? { ...row, completed: Boolean(row.completed), deleted: Boolean(row.deleted) } : undefined;
  function assertLiveTask(projectId, taskId) {
    if (get.get(projectId, taskId)?.deleted) {
      const error = new Error('Deleted task must be restored before editing');
      error.status = 409;
      throw error;
    }
  }
  function transaction(operation) {
    database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    list: (projectId) => list.all(projectId).map(taskValue),
    setDeleted(projectId, taskId, deleted) {
      if (typeof deleted !== 'boolean') {
        const error = new Error('Deletion state must be a boolean');
        error.status = 400;
        throw error;
      }
      if (getProject.get(projectId)?.archived) {
        const error = new Error('Archived project cannot be changed');
        error.status = 409;
        throw error;
      }
      // Only visibility changes; ownership, fields, and all reserved positions stay intact.
      updateDeleted.run(Number(deleted), projectId, taskId);
      return taskValue(get.get(projectId, taskId));
    },
    create(projectId, title, priority = 'Normal') {
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) throw new Error('Task title is required');
      return transaction(() => {
        const taskId = insert.run(projectId, trimmedTitle, priority, projectId).lastInsertRowid;
        rememberCreatedPosition.run(taskId);
        return taskValue(get.get(projectId, taskId));
      });
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
      return transaction(() => {
        const source = getProject.get(projectId);
        const destination = getProject.get(destinationProjectId);
        if (!source || !destination) fail(404, 'Project not found');
        if (source.archived || destination.archived) fail(409, 'Archived projects cannot move tasks');
        if (source.id === destination.id) fail(400, 'Destination must be another project');
        if (!get.get(projectId, taskId)) fail(404, 'Task not found');
        assertLiveTask(projectId, taskId);
        rememberDestinationPosition.run(taskId, destinationProjectId, destinationProjectId);
        move.run(destinationProjectId, destinationProjectId, taskId, projectId, taskId);
        return taskValue(get.get(destinationProjectId, taskId));
      });
    },
    setCompleted(projectId, taskId, completed) {
      assertLiveTask(projectId, taskId);
      if (typeof completed !== 'boolean') throw new Error('Completion must be a boolean');
      update.run(Number(completed), projectId, taskId);
      return taskValue(get.get(projectId, taskId));
    },
    setDueDate(projectId, taskId, dueDate) {
      assertLiveTask(projectId, taskId);
      const date = normalizeDueDate(dueDate);
      updateDueDate.run(date, projectId, taskId);
      return taskValue(get.get(projectId, taskId));
    },
    setNotes(projectId, taskId, notes) {
      assertLiveTask(projectId, taskId);
      if (typeof notes !== 'string') {
        const error = new Error('Task notes must be text');
        error.status = 400;
        throw error;
      }
      updateNotes.run(notes, projectId, taskId);
      return taskValue(get.get(projectId, taskId));
    },
    setPriority(projectId, taskId, priority) {
      assertLiveTask(projectId, taskId);
      if (!['Low', 'Normal', 'High'].includes(priority)) {
        const error = new Error('Task priority must be Low, Normal, or High');
        error.status = 400;
        throw error;
      }
      updatePriority.run(priority, projectId, taskId);
      return taskValue(get.get(projectId, taskId));
    },
    rename(projectId, taskId, title) {
      assertLiveTask(projectId, taskId);
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
