# Workboard

A dependency-free project board using Node.js 22.22.1, built-in HTTP, and SQLite.

## Run

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. To configure the port and persistent database:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Each project supports task creation, completion checkboxes, and All/Open/Completed filtering. The project list filters Active/Archived projects and shows completion summaries. Rename active projects without changing their URL, order, or tasks. Rename tasks without changing their ownership, order, completion, or filter membership. Each task has an independent Low/Normal/High priority (default Normal), saved across reloads and restarts. Archive and restore projects without losing tasks; archived project pages are read-only, including rename and priority controls. Projects, tasks, and archive state persist in SQLite, including databases from earlier checkpoints. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use temporary databases and verify validation, creation order, safe rendering, project navigation, health, task ownership, completion, filtering, archive/restore, read-only archived projects, completion summaries, project and task rename validation and identity preservation, priority defaults and independent edits, database migration, and persistence across server restarts.
