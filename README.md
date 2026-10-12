# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port `8080` and database path
`data/workboard.sqlite`. The server binds to `0.0.0.0`; keep the database file
to preserve projects, tasks, completion state, and archive state across restarts.
Existing databases are upgraded automatically. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration tests use temporary SQLite databases and verify project and task
creation, blank-input validation, ordering, HTML escaping, project navigation,
task ownership, completion changes, filtering, health, and persistence across
process restarts, archive/restore, read-only archived projects, completion summaries,
and migration from the previous schema.
