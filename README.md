# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; the defaults are
port `8080` and database `data/workboard.sqlite`. Keep the SQLite file to retain
projects, tasks, and completion state across restarts. `GET /health` returns
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

Run the integration checks:

```sh
npm test
```

The checks use a temporary SQLite file and verify validation, creation order,
project pages, safe rendering, task completion and filters, project isolation,
health, database migration, archive/restore, completion summaries, archived write
protection, renaming with identity and data preservation, and persistence after
server restarts.
