# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. Defaults are port
8080 and database `data/workboard.sqlite`. Keep the database file to preserve
projects across restarts. `GET /health` returns `{"status":"ok"}`.

Verification:

```sh
npm test
```

Tests use an isolated temporary SQLite database and check required labels,
validation, creation order, trimmed/escaped names, project navigation, health,
and persistence of project identities across server restarts.
