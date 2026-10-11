# Workboard

A dependency-free project and task board using Node.js 22.22.1, built-in HTTP and SQLite, and server-rendered HTML/CSS. Create projects and project-owned tasks, toggle task completion, and filter by All, Open, or Completed. Archive or restore projects using the Active/Archived project filter; archived projects remain viewable with read-only tasks. Project rows summarize completed tasks out of all tasks. Completion and filter controls submit forms using browser JavaScript.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Preserve that file to retain projects, tasks, IDs, completion state, and archive state across restarts. Existing databases are migrated automatically without removing data. Parent directories are created automatically.

`GET /health` returns HTTP 200 with `{"status":"ok"}`.

## Verify

```sh
npm test
node --check server.js
```

Tests use temporary databases and ephemeral ports, exercising validation, creation order, HTML escaping, navigation, missing records, task isolation, completion, filtering, archive/restore, read-only enforcement, completion summaries, schema migration, and persistence across process restarts.
