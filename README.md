# Workboard

Requires Node.js 22.22.1. No installation or external dependencies are needed.

```sh
npm start
```

The HTTP server binds to `0.0.0.0` at `PORT` (default `8080`). SQLite data is stored at `DB_PATH` (default `data/workboard.sqlite`); parent directories are created automatically. Keep this file to preserve projects, archive state, tasks, task completion, and task priorities across restarts. Existing databases are migrated automatically without losing data.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The application uses server-rendered forms. Each project has its own tasks, completion checkboxes, an All/Open/Completed task filter, and an All/Low/Normal/High priority filter. Both filters apply together in creation order and remain selected through task edits, including when a changed task no longer matches. Opening a project from the list starts both filters at All. Filter selections are URL query parameters, not saved task data, and never affect completion summaries. Small browser change handlers submit completion and filter forms immediately; without JavaScript, fallback buttons submit them explicitly. The project list supports Active/Archived filtering, archive/restore controls, and completion summaries across all tasks. Active projects can be renamed with a trimmed, nonblank name without changing their URL, creation order, or tasks. Each task can also be renamed with a trimmed, nonblank title, preserving its identity, owner, order, completion state, and filter membership. Each task has an independent Low/Normal/High priority, defaulting to Normal for both new and migrated tasks. Priority changes preserve task identity, order, completion, and summaries; renaming preserves priority. Archived projects remain readable and filterable, but project/task renaming, task creation, completion changes, and priority changes are blocked both in the UI and on the server. Restoring a project preserves its tasks and enables renaming again.

Tests use a temporary database and check schema migration, validation, escaping, ordering, project isolation, completion, filtering, archive/restore, rename identity preservation, priority defaults and validation, independent priority edits, all combined filter combinations, selection preservation and immediate re-filtering after edits, read-only restrictions, detail navigation, and process-restart persistence.
