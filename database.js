import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openProjectStore(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const database = new DatabaseSync(filename);
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
      if (typeof name !== 'string' || !name.trim()) {
        throw new TypeError('Project name is required');
      }
      const result = insert.run(name.trim());
      return find.get(result.lastInsertRowid);
    },
    close: () => database.close(),
  };
}
