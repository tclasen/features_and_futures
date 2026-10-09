# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; default port is
8080 and default database path is `data/workboard.sqlite`. Keep the database
file to preserve projects, tasks, completion state, and archive state across restarts.
Existing databases are upgraded automatically without losing projects or tasks.

Open a project to create tasks, toggle their completion checkboxes, and select
All, Open, or Completed in the Task filter. Tasks belong only to their project.

The project list defaults to Active. Use Archive project to move a project to
Archived, then Restore project to bring it back. Archived projects remain
viewable and filterable, but tasks cannot be created or changed until restored.
Each project row summarizes completed tasks out of all its tasks.

`GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use an isolated temporary SQLite database and verify validation, project
ordering, HTML escaping, detail navigation, health, task validation, completion,
filtering, project isolation, database migration, archive/restore, read-only
archived tasks, completion summaries, and restart persistence. Completion regression checks
exercise the browser change handler's synchronous save contract and verify both
checking and unchecking through immediate reloads and process restarts.
