# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `GET /health` returns `{"status":"ok"}`. `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. The database directory is created automatically. Keep the SQLite file to preserve projects, their tasks, and task completion across restarts.

Open a project to create tasks, toggle their completion checkboxes, or filter by All, Open, and Completed. Filters are reflected in the page URL; opening a project from the list defaults to All.

The project list defaults to Active and can be filtered to Archived. Archive and restore projects from their rows; each row summarizes completed tasks out of all tasks. Archived project pages keep tasks and filters visible but disallow task creation and completion changes. Archive state persists, and existing databases are migrated automatically without losing projects or tasks.

```sh
npm test
```

Tests use a temporary database and verify project/task validation, escaped rendering, creation order, navigation, project ownership, completion, filtering, health, archive/restore, read-only enforcement, completion summaries, schema migration, and persistence after restarting the server.
