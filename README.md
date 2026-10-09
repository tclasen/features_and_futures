# Workboard

A dependency-free project board built with Node.js 22.22.1, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript.

## Run

```sh
npm start
```

The server listens on `0.0.0.0:8080`. Override the port and SQLite path as needed:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The database directory is created automatically. Keep the SQLite file to preserve projects, tasks, completion state, and archive state across restarts. Existing databases are upgraded automatically without losing data. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Integration tests use temporary SQLite databases and verify project and task validation, creation order, project isolation, completion updates, archive/restore, completion summaries, archived write protection, legacy database migration, routes, health, and persistence across server restarts.

Browser smoke check: visit `/`, submit a whitespace-only name and check the alert, create two projects, open one, and use `Projects` to return. On a project page, create tasks, toggle their completion checkboxes, and check the All/Open/Completed filters. Try a whitespace-only task title and confirm the alert. Return to the project list and check the completion summaries. Archive a project, switch Project filter to Archived, and open it: the Archived project notice should appear, task creation and completion should be disabled, and task filtering should still work. Restore it from the Archived list. Reload and restart the server with the same `DB_PATH` to confirm names, IDs, tasks, completion state, and archive state persist.

The project API includes `archived`, `total`, and `completed` fields. `PATCH /api/projects/<id>` accepts `{ "archived": true }` (or `false` to restore). Task writes to archived projects return HTTP 409; reads remain available.
