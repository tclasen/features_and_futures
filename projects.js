import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openProjectStore(path) {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK(length(trim(name)) > 0)
    )
  `);
  const list = database.prepare('SELECT id, name FROM projects ORDER BY id');
  const find = database.prepare('SELECT id, name FROM projects WHERE id = ?');
  const insert = database.prepare('INSERT INTO projects (name) VALUES (?)');

  return {
    list: () => list.all(),
    find: (id) => find.get(id),
    create(name) {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      if (!trimmed) return null;
      const result = insert.run(trimmed);
      return find.get(result.lastInsertRowid);
    },
    close: () => database.close(),
  };
}
