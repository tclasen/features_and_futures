# Workboard

Requires Node.js 22.22.1; no external dependencies.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`. `GET /health` returns `{"status":"ok"}`.
Keep the configured SQLite file to retain projects, tasks, and completion state across restarts.
Project pages let you create tasks, toggle completion, and filter All, Open, or Completed tasks.
The project list filters Active or Archived projects and shows completion summaries.
Archive projects to make their tasks read-only; restore them without losing saved tasks.
Existing databases are migrated automatically.

## Verify

```sh
npm test
```

Integration tests use temporary databases outside the repository and check
project and task validation, ordering, navigation, HTML escaping, project isolation,
completion updates, filtering, archive/restore, read-only enforcement, schema migration,
completion summaries, and restart persistence.
