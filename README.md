# Workboard

Requires Node.js 22.22.1. No dependencies or installation step are needed.

```sh
npm start
```

The HTTP server binds to `0.0.0.0`, using `PORT` (default `8080`). Set `DB_PATH` to the SQLite file to use (default `./data/workboard.sqlite`). Its parent directories are created automatically. Keep this file to preserve projects, archive states, tasks, and completion states across restarts. Existing databases are migrated automatically without changing project or task IDs.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. Project pages support task creation, completion checkboxes, and All/Open/Completed filtering. Tasks are isolated by project and shown in creation order. The project list provides Active/Archived filtering, archive/restore controls, and completion summaries counting all tasks. Active project pages also support renaming with trimmed, nonempty names while retaining IDs, creation order, tasks, and summaries. Renamed names persist in SQLite. Archived projects remain readable and filterable, but renaming, task creation, and completion changes are disabled and rejected by the server.

The tests launch real server processes against a temporary database and verify validation, ordering, project isolation, routes, and persistence across process restarts. Migration coverage checks existing databases. A lightweight DOM adapter also tests UI event handlers, filters, summaries, archive/restore, renaming, and read-only archived pages without external dependencies.
