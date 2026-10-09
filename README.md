# Workboard

A dependency-free project board using Node.js 22.22.1, browser JavaScript, and SQLite.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. Both environment variables are optional; the command above shows their defaults. Keep the configured SQLite file to preserve projects, tasks, completion state, and archive state across restarts. Existing databases are migrated automatically.

Open a project to create tasks, toggle completion, and filter by All, Open, or Completed. The project list starts with Active projects; use Project filter to view Archived projects and restore them. Archived project pages are read-only. Every project row shows completed/total task counts.

`GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use temporary SQLite databases and verify project/task validation, creation order, project routes, task ownership, completion updates, archive/restore, summaries, legacy database migration, and persistence across server restarts. No package installation is needed.
