# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite with no external dependencies.

Run:

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). Set `DB_PATH` to choose the persistent SQLite file (default `./data/workboard.sqlite`). For example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. `GET /health` returns `{"status":"ok"}`.

Each project has tasks with saved completion state and All, Open, and Completed filters.
The project list starts with Active projects and can show Archived projects. Archive or
restore a project from its row; each row shows completed and total task counts.
Archived projects retain their tasks and filters while task creation and completion
changes are disabled. Existing databases are migrated automatically.

Verify validation, creation order, ownership, routing, archive/restore, summaries,
database migration, and persistence across process restarts:

```sh
npm test
```
