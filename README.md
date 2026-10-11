# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. Defaults: port `8080`, database `data/workboard.sqlite`. Keep the configured SQLite file to preserve projects, tasks, completion state, and archive state across restarts. Existing databases are migrated automatically.

Open `/` to create and open projects, view completion summaries, and filter Active or Archived projects. Archive or restore projects from their rows. Each active project page lets you rename the project, create tasks, toggle completion, and filter by All, Open, or Completed. Renaming preserves the project URL, creation order, and tasks. Archived project pages keep tasks visible and filterable but disable renaming, creation, and completion changes. `GET /health` returns `{"status":"ok"}`.

## Checks

```sh
npm test
node --check server.js
```

Tests use temporary SQLite databases and verify validation, creation order, escaping, navigation markup, health, project isolation, task filters, completion changes, archive/restore, read-only enforcement, completion summaries, database migration, renaming without changing identity or task state, and persistence across process restarts.
