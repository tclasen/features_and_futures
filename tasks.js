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
  const list = database.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? ORDER BY id');
  const get = database.prepare('SELECT id, title, completed, priority FROM tasks WHERE project_id = ? AND id = ?');
  const insert = database.prepare('INSERT INTO tasks (project_id, title) VALUES (?, ?)');
  const update = database.prepare('UPDATE tasks SET completed = ? WHERE project_id = ? AND id = ?');
  const updateTitle = database.prepare('UPDATE tasks SET title = ? WHERE project_id = ? AND id = ?');
  const updatePriority = database.prepare('UPDATE tasks SET priority = ? WHERE project_id = ? AND id = ?');
  const taskValue = (row) => row ? { ...row, completed: Boolean(row.completed) } : undefined;

  return {
    list: (projectId) => list.all(projectId).map(taskValue),
    create(projectId, title) {
      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle) throw new Error('Task title is required');
      return taskValue(get.get(projectId, insert.run(projectId, trimmedTitle).lastInsertRowid));
    },
    setCompleted(projectId, taskId, completed) {
      if (typeof completed !== 'boolean') throw new Error('Completion must be a boolean');
      update.run(Number(completed), projectId, taskId);
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
