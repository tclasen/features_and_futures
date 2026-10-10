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

The database directory and schema are created on startup. Retain the database file to preserve projects, tasks, and completion state across restarts. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
node --check server.js
```

Tests use temporary databases and check validation, creation order, safe HTML rendering, navigation, health, project isolation, filtering, completion updates, and persistence across process restarts. The UI uses standard HTML forms and requires no client-side dependencies. Task checkboxes and the task filter submit automatically using browser JavaScript; fallback submit buttons are available when JavaScript is disabled.
