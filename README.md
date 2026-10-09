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

The database directory is created automatically. Keep the SQLite file to preserve projects across restarts. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Integration tests use a temporary SQLite database and verify validation, creation order, project routes, health, and persistence across server restarts.

Browser smoke check: visit `/`, submit a whitespace-only name and check the alert, create two projects, open one, and use `Projects` to return. Reload and restart the server with the same `DB_PATH` to confirm names and IDs persist.
