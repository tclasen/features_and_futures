# Workboard

Requires Node.js 22.22.1. No dependencies to install.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. `PORT` defaults to
8080 and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the configured
SQLite file to preserve projects, tasks, completion state, and archive state across
server restarts. Existing databases are migrated automatically.

Open a project to create tasks, toggle their completion checkboxes, and filter by
All, Open, or Completed. Project rows show completed/total task counts. Use the
Project filter to view Active or Archived projects and archive or restore them.
Archived project pages allow viewing and filtering tasks but not changing them.

Health check: `GET /health` returns `{"status":"ok"}`.

Run automated validation, navigation, project-isolation, filtering, and
archive/restore, database-migration, and restart-persistence checks:

```sh
npm test
```
