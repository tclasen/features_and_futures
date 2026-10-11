# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; the defaults are
port `8080` and database `data/workboard.sqlite`. Keep the SQLite file to retain
projects, tasks, completion state, and priorities across restarts. `GET /health` returns
`{"status":"ok"}`.

Open a project to create tasks, change completion with each task's checkbox, and
filter tasks by All, Open, or Completed. Tasks appear in creation order and belong
only to the project where they were created.

The project list starts with Active projects. Use Project filter to view Archived
projects and restore them. Archived project pages show their tasks and allow
filtering, while task creation and completion controls are disabled. Each project
row summarizes completed tasks out of all its tasks. Archive state persists, and
existing databases are upgraded automatically without losing projects or tasks.

Use New project name and Rename project on an active project page to rename it.
Names are trimmed and must not be blank. Renaming preserves the project URL,
creation order, tasks, and completion summary. Archived projects cannot be renamed
until restored. Project names persist across restarts.

Each task row has New task title and Rename task controls. Titles are trimmed and
must not be blank. Renaming preserves ownership, creation order, completion state,
filter membership, and completion summaries. Archived projects disable task
renaming until restored. Renamed titles persist across restarts.

Each task row has a Task priority selector with Low, Normal, and High options.
Existing and new tasks default to Normal. Changes save immediately and persist
across restarts without changing task order, ownership, completion, or summaries.
Renaming preserves priority. Archived projects disable priority controls until
restored, retaining their saved values.

Run the integration checks:

```sh
npm test
```

The checks use a temporary SQLite file and verify validation, creation order,
project pages, safe rendering, task completion and filters, project isolation,
health, database migration, archive/restore, completion summaries, archived write
protection, project and task renaming with identity and data preservation, task
priority defaults and independence, and persistence after server restarts.
