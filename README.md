# Workboard

A dependency-free project board using Node.js 22.22.1, built-in HTTP and SQLite.

## Run

```sh
npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`.
Set `PORT` to override the default port and `DB_PATH` to select the SQLite file:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The database directory and schema are created on startup; existing databases are migrated in place. Retain the database file to preserve projects, archive state, tasks, and completion state across restarts. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
node --check server.js
```

Tests use temporary databases and check validation, creation order, safe HTML rendering, navigation, health, project isolation, filtering, completion updates, archive/restore, summaries, renaming with stable identity, schema migration, and persistence across process restarts. The UI uses standard HTML forms and requires no client-side dependencies. Task checkboxes and filters submit automatically using browser JavaScript; fallback submit buttons are available when JavaScript is disabled.

The project list starts with Active projects; choose Archived to open or restore archived projects. Each summary counts all tasks, independent of task filters. Archived project pages keep tasks and filters visible but disable creation and completion controls. The server also rejects task mutations for archived projects. Active project pages support renaming with trimmed, nonblank names while preserving IDs, creation order, and tasks. Rename controls are disabled for archived projects, and the server rejects their rename requests.
