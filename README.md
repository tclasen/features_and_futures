# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port `8080` and database path
`data/workboard.sqlite`. The server binds to `0.0.0.0`; keep the database file
to preserve project names and IDs, tasks, completion state, priorities, and archive state across restarts.
Existing databases are upgraded automatically. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration tests use temporary SQLite databases and verify project and task
creation, blank-input validation, ordering, HTML escaping, project navigation,
task ownership, completion changes, filtering, health, and persistence across
process restarts, archive/restore, read-only archived projects, completion summaries,
migration from the previous schema, and project/task renaming with identity,
order, ownership, and completion preservation and archived-project protection.
Priority tests cover migration defaults, independent saved values, exact options,
filter and summary preservation, rename preservation, and archive/restore protection.
Combined-filter tests cover all completion/priority combinations, creation order,
selection preservation through edits and validation, immediate matching-row changes,
and saved task state across restarts and archive/restore. Both filters remain usable
on archived project pages.
