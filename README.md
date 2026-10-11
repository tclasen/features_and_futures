# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`.
`PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`.
Use the same database path across restarts to retain projects, tasks, completion state,
archive state, and renamed project names. Existing databases are upgraded automatically.
`GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
```

Each project page supports task creation, completion checkboxes, and an All/Open/Completed
filter. New tasks are open, and both project names and task titles are trimmed.
The project list starts with Active projects and can show Archived projects. Archive
and restore preserve tasks; archived project pages allow viewing and filtering but
disable task creation and completion changes. Each project row summarizes completion
across all its tasks.

Active project pages provide New project name and Rename project controls. Renaming
trims the name and preserves the project's URL, creation order, tasks, and completion
summary. Blank names show an alert. Archived projects disable renaming until restored.

The integration test uses an isolated database, exercises project and task validation,
creation order, project isolation, and completion updates, and restarts the server to
verify persistence, database migration, archive/restore, and completion summaries.
The browser-code interaction test uses a small DOM harness to check task validation,
filtering, checkbox updates, save-error recovery, project archive/restore, summaries,
archived page controls, and renaming without external dependencies. Integration checks
also verify rename validation, identity preservation, archived restrictions, and
renamed names surviving server restarts.
