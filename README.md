# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step are needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). `DB_PATH` selects
the persistent SQLite file (default `data/workboard.sqlite`); its parent
directory is created automatically. Use the same file across restarts.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
npm test
```

Open `/` to create and open projects. Each project page supports creating
tasks, saving their completion state, and filtering by All, Open, or Completed.
Projects and tasks retain creation order and persist in the configured database.
The project list initially shows Active projects; choose Archived to open or
restore archived projects. Archiving preserves tasks and completion state while
disabling task creation and completion changes. Each project row shows its
completed/total task counts, independent of task filtering. Existing databases
are upgraded automatically without changing project or task IDs.
`GET /health` returns
`{"status":"ok"}`. The integration test uses an isolated temporary database
and verifies validation, project ownership, completion updates, ordering,
HTTP routes, archive/restore protection, completion summaries, migration from the
previous schema, and persistence across server restarts.

Active project pages also support renaming via New project name and Rename
project. Names are trimmed and must be nonblank. Renaming preserves the URL,
creation order, tasks, and completion summary. Archived projects cannot be
renamed until restored. The integration tests verify these rules and persistence.
