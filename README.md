# Workboard

Requires Node.js 22.22.1. No dependencies need to be installed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. Configure the port and persistent
SQLite database location with environment variables:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Each project page lets you create tasks,
toggle completion, and filter by All, Open, or Completed. The project list shows
completion summaries and filters Active or Archived projects. Archive and restore
buttons preserve project tasks; archived project pages allow viewing and filtering
tasks with creation and completion disabled. Projects, archive state, and tasks
persist in the configured SQLite database, including when upgrading an existing
database. `GET /health` returns `{"status":"ok"}`.

Active project pages also let you rename a project. Names are trimmed and must
not be blank. Renaming preserves the project URL, list position, and tasks;
archived projects must be restored before they can be renamed.

Run the integration checks with `npm test`.
