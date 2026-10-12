// tasks.position is the current ordering position; this table retains positions
// in former projects, including while their tasks are elsewhere.
export function createTaskOrdering(database) {
  function transaction(operation) {
    database.exec('BEGIN');
    try {
      const result = operation();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }

  transaction(() => database.exec(`
    CREATE TABLE IF NOT EXISTS task_project_positions (
      task_id INTEGER NOT NULL REFERENCES tasks(id),
      project_id INTEGER NOT NULL REFERENCES projects(id),
      position INTEGER NOT NULL,
      PRIMARY KEY (task_id, project_id)
    );
    CREATE INDEX IF NOT EXISTS task_positions_project
      ON task_project_positions(project_id, position);
    INSERT OR IGNORE INTO task_project_positions (task_id, project_id, position)
      SELECT id, project_id, position FROM tasks;
  `));

  const nextPosition = database.prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS position
    FROM task_project_positions WHERE project_id = ?`);
  const rememberPosition = database.prepare(`INSERT INTO task_project_positions
    (task_id, project_id, position) VALUES (?, ?, ?)`);
  const findPosition = database.prepare(`SELECT position FROM task_project_positions
    WHERE task_id = ? AND project_id = ?`);
  const insertTask = database.prepare(`INSERT INTO tasks (project_id, title, priority, position)
    VALUES (?, ?, ?, ?)`);
  const moveTask = database.prepare(`UPDATE tasks SET project_id = ?, position = ?
    WHERE id = ? AND project_id = ?`);

  return {
    create(projectId, title, priority) {
      return transaction(() => {
        const { position } = nextPosition.get(projectId);
        const result = insertTask.run(projectId, title, priority, position);
        rememberPosition.run(result.lastInsertRowid, projectId, position);
        return result;
      });
    },
    move(taskId, sourceId, destinationId) {
      return transaction(() => {
        let remembered = findPosition.get(taskId, destinationId);
        if (!remembered) {
          remembered = nextPosition.get(destinationId);
          rememberPosition.run(taskId, destinationId, remembered.position);
        }
        const result = moveTask.run(destinationId, remembered.position, taskId, sourceId);
        if (result.changes !== 1) throw new Error('Task is no longer in its source project');
        return result;
      });
    },
  };
}
