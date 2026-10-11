# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to 8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the configured SQLite file to preserve projects, archive state, tasks, and completion state across restarts. Existing databases are automatically upgraded with active projects as the default. Its parent directory is created automatically.

`GET /health` returns HTTP 200 with `{"status":"ok"}`.

The application uses server-rendered HTML and native forms. SQLite assigns an internal creation sequence for stable project and task ordering; public IDs are UUIDs. Project names and task titles are trimmed before saving and escaped when rendered. Active project pages provide a New project name field and Rename project button. Renaming preserves the URL, creation order, tasks, completion state, and summaries; blank names are rejected. Each project page supports task creation, saved completion checkboxes, and All, Open, and Completed filters. Each task row provides a New task title field and Rename task button. Task renaming trims and validates the title, updates the completion label, and preserves ownership, order, completion, and summaries. The project list defaults to Active, with an Archived filter and archive/restore controls. Project summaries count all completed and total tasks. Archived project pages retain task filtering but disable project and task renaming, task creation, and completion changes, including direct POST requests. Restoring a project preserves its tasks. Small browser event handlers submit completion and filter changes automatically.

## Verify

```sh
npm test
```

The tests launch real HTTP servers with temporary SQLite files and check validation, creation order, navigation, HTML escaping, health, project isolation, task filtering, completion updates, archive/restore, read-only enforcement, completion summaries, legacy database migration, project and task renaming without identity or data loss, and persistence across process restarts.
