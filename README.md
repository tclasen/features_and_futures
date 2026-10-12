# Workboard

Requires Node.js 22.22.1. No dependencies to install.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`. `GET /health` returns `{"status":"ok"}`.
Projects, archive state, and tasks are saved in SQLite and retained across restarts.
Use the Project filter to view Active or Archived projects. Archive or restore
projects from their rows; summaries show completed tasks out of all tasks.
Archived project pages allow viewing and filtering but prevent task changes.
Existing databases are migrated automatically without losing projects or tasks.
Open a project to create tasks, toggle completion, and filter All, Open, or
Completed tasks. Native HTML forms handle creation and navigation; small inline
browser event handlers submit completion and filter changes.

## Verify

```sh
npm test
```

Tests use a temporary database outside the repository and verify validation,
creation order, escaping, navigation, health, task filtering, project isolation,
task/completion persistence, schema migration, archive/restore, read-only archived
projects, and completion summaries across restarts.
