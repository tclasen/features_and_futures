import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openProjects(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0)
    )
  `);
  const list = database.prepare('SELECT id, name FROM projects ORDER BY id');
  const find = database.prepare('SELECT id, name FROM projects WHERE id = ?');
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');

  return {
    list: () => list.all(),
    find: (id) => find.get(id),
    create(name) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) return null;
      const result = insert.run(trimmedName);
      return { id: Number(result.lastInsertRowid), name: trimmedName };
    },
    close: () => database.close(),
  };
}
