# Workboard

Requires Node.js 22.22.1. No installation or external dependencies are needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; defaults are port
8080 and database `data/workboard.sqlite`. Keep the configured database file to
preserve projects across restarts. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use temporary SQLite files and verify validation, creation order, routing,
and persistence across server-process restarts.
