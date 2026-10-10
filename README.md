# Workboard

A project and task management application using Node.js 22.22.1, built-in HTTP and SQLite, and browser JavaScript. No dependencies or installation step are required.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

`PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The server binds to `0.0.0.0` and creates the database's parent directory if needed. Keep the configured SQLite file to retain projects, tasks, completion states, and archive states between restarts. Existing databases are migrated automatically without changing project or task IDs. `GET /health` returns `{"status":"ok"}`.

The project list initially shows Active projects; its Project filter also shows Archived projects. Each row includes a completion summary counting all of the project's tasks. Archive and restore preserve tasks and completion state.

Each project page supports task creation, completion checkboxes, and All/Open/Completed filters. Tasks remain scoped to their owning project; filters initially select All on each page load. Archived project pages retain task filtering but disable creation and completion updates; the server also rejects these writes.

## Verify

```sh
npm test
```

Tests start real server processes with a temporary SQLite database and verify health, input validation, creation order, project lookup, task ownership, completion updates, page/asset routes, archive/restore, completion summaries, legacy database migration, and persistence after process restarts. Temporary files are removed afterward.
