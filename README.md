# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`; parent directories are
created automatically. Keep the database file to preserve projects, tasks, and
completion and archive state across restarts. Existing databases are migrated
without losing projects or tasks.

Open a project to create tasks, toggle their completion, and filter by All, Open,
or Completed. Each project has its own tasks; filtering does not change saved data.
The project list defaults to Active; switch to Archived to open or restore archived
projects. Archived projects retain their tasks but cannot create tasks or change
completion until restored. Project rows summarize completed tasks out of all tasks.
Active project pages also let you rename a project. Names are trimmed and must not
be blank; renaming preserves the URL, creation order, tasks, and summary. Archived
projects cannot be renamed until restored. Renamed names persist across restarts.

Health check: `GET /health` returns `{"status":"ok"}`.

Run automated HTTP and persistence tests with `npm test`. Tests use a temporary
SQLite database and verify validation, creation order, project lookup, page/asset
routes, task ownership, completion updates, archive/restore restrictions, summaries,
rename validation and identity preservation, legacy database migration, and
persistence through process restarts.
