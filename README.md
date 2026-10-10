# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`; `GET /health` returns `{"status":"ok"}`.
Projects and their tasks (including completion state) are stored in the configured
SQLite file, which must be retained across restarts. Open a project to create tasks,
toggle completion, and filter by All, Open, or Completed. The project list defaults
to Active; select Archived to open or restore archived projects. Archived project
pages are read-only, including the rename controls. Active projects can be renamed
with New project name and Rename project without changing their URL or tasks.
Project rows show completed/total task counts. Existing
SQLite databases are migrated automatically to preserve projects and tasks.

Verify:

```sh
npm test
```

Tests use a temporary SQLite database outside the repository and check health,
validation, ordering, safe rendering, navigation, task ownership, completion,
filtering, archive/restore, completion summaries, database migration, read-only
archived pages, rename validation and identity preservation, and persistence across restarts.
