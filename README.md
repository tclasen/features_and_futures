# Workboard

Requires Node.js 22.22.1. No installation or external dependencies are needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. Defaults are port
8080 and database `data/workboard.sqlite`. Keep the database file to preserve
projects, tasks, task completion, and archive state across restarts. `GET /health` returns `{"status":"ok"}`.

Run the integration checks:

```sh
npm test
```

The checks use a temporary SQLite database and verify validation, escaping,
creation order, project detail navigation, health, task filtering and project
isolation, completion toggles, archive/restore, completion summaries, legacy
database migration, and restart persistence.
