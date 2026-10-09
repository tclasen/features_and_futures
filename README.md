# Workboard

A dependency-free project board using Node.js 22.22.1, browser JavaScript, and SQLite.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. Both environment variables are optional; the command above shows their defaults. Keep the configured SQLite file to preserve project names and IDs across restarts.

`GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use a temporary SQLite database and verify validation, creation order, project routes, and persistence across server restarts. No package installation is needed.
