export function normalizeDueDate(value) {
  const invalid = () => {
    const error = new Error('Due date must be a valid YYYY-MM-DD date');
    error.status = 400;
    throw error;
  };
  if (typeof value !== 'string') return invalid();
  const date = value.trim();
  if (!date) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid();
  const [year, month, day] = date.split('-').map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) {
    return invalid();
  }
  return date;
}

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
  const list = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? ORDER BY id');
  const get = database.prepare('SELECT id, title, completed, priority, due_date FROM tasks WHERE project_id = ? AND id = ?');
  const insert = database.prepare('INSERT INTO tasks (project_id, title, priority) VALUES (?, ?, ?)');
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
      return taskValue(get.get(projectId, insert.run(projectId, trimmedTitle, priority).lastInsertRowid));
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
