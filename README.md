# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port 8080 and `./data/workboard.sqlite`.
`GET /health` returns `{"status":"ok"}`. Projects, project-owned tasks, and task completion are persisted in SQLite.
Open a project to create tasks, toggle completion, or filter by All, Open, and Completed.
The project list filters Active/Archived projects and shows completion summaries.
Archive or restore a project without losing tasks; archived pages are read-only.
Existing SQLite databases are migrated automatically.

Verify:

```sh
npm test
```

The integration test checks health, blank-name validation, trimming, creation order,
project routes, task validation and order, project isolation, completion updates,
archive/restore, read-only enforcement, completion summaries, schema migration,
and persistence across server restarts using a temporary database.
