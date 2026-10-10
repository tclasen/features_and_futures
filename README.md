# Workboard

Requires Node.js 22.22.1. No packages need to be installed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). Set `DB_PATH`
to the SQLite file to retain projects, archive state, their tasks, and completion state across
restarts; the default is `data/workboard.sqlite`. Its parent directory is created automatically.
`GET /health` returns `{"status":"ok"}`.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

Tests use temporary databases outside the repository and remove them afterward.

The project list starts with Active projects; switch Project filter to Archived to
open or restore an archived project. Archived project tasks can be viewed and
filtered, but creation and completion changes are disabled. Completion summaries
count every task in each project. Existing databases are migrated automatically.

On an active project page, use New project name and Rename project to change its
name. Names are trimmed and cannot be blank. Renaming preserves the project's URL,
list position, tasks, and completion summary. Archived projects must be restored
before they can be renamed.

Each task row provides New task title and Rename task. Titles are trimmed and
cannot be blank. Renaming preserves ownership, creation order, completion state,
and completion summaries. Task rename controls are disabled while the project
is archived and become available after restoration.

Each task has a Task priority dropdown with Low, Normal, and High options.
New and existing tasks default to Normal. Priority is saved independently for
each task and survives renaming, completion changes, and restarts. Archived
projects disable priority edits; restoration preserves the saved priorities.
