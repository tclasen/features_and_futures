# Workboard

Requires Node.js 22.22.1. There are no application dependencies to install.

```sh
npm start
```

The server binds to `0.0.0.0` at `PORT` (default `8080`). Set `DB_PATH` to the
SQLite file to use (default `data/workboard.sqlite`). Its parent directory is
created automatically. Keep this file to preserve projects, tasks, and completion
state and archive status between restarts. Existing project databases are migrated
automatically without changing project IDs or tasks.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm test
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. Project creation and
navigation use ordinary browser forms. Names are trimmed before persistence;
blank names return a visible validation alert without creating a project.
Each project has its own tasks. Titles are trimmed and blank titles show a
validation alert. Checkboxes save completion immediately; the task filter shows
All (the default), Open, or Completed tasks in creation order. Direct project
URLs remain usable after reloads and restarts.

The project filter defaults to Active and also offers Archived. Archive project
moves a project to Archived; Restore project returns it to Active, retaining its
tasks and completion state. Archived project pages allow viewing and filtering
tasks but disable creation and completion changes. The server also rejects task
changes on archived projects. Each project row shows completed/total task counts
across all its tasks.

Active project pages offer New project name and Rename project. Renaming trims
the name and preserves the project URL, creation order, tasks, and completion
summary. Blank names show a validation alert without changing the saved name.
Archived projects disable renaming, and the server rejects rename requests until
the project is restored. Renamed project names persist between restarts.
