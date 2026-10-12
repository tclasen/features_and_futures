# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

```sh
npm start
```

The server binds to `0.0.0.0:8080`. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Each project page lets you create tasks, toggle their completion, and filter by
All, Open, or Completed. The project list shows completion summaries and lets you
filter Active or Archived projects, archive projects, and restore them. Archived
projects keep their tasks visible but disable task creation and completion changes.
Projects, tasks, and archive state persist in the configured SQLite file; existing
databases are migrated automatically.

Run the integration checks with `npm test`.
