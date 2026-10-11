# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`.
`PORT` defaults to `8080`; `DB_PATH` defaults to `./data/workboard.sqlite`.
Projects, tasks, completion, and archive state persist in that SQLite file.
Existing databases are migrated automatically.
Use Project filter to view Active or Archived projects; archive or restore from each row.
Rows summarize completed/total tasks. Archived projects remain readable with task filtering,
but cannot create tasks or change completion.
Open an active project to create tasks, toggle completion, or filter All/Open/Completed. `GET /health` returns
`{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration tests use temporary databases and verify project/task validation,
creation order, escaped names and titles, navigation, project ownership, task
filters and completion, archive/restore, summaries, database migration, health,
and persistence across server restarts.
Temporary files are removed afterward.
