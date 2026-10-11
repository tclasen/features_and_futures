# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; defaults are port
8080 and database `data/workboard.sqlite`. Use the same `DB_PATH` across restarts
to preserve projects. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use an isolated temporary SQLite database and check project creation,
blank-name alerts, name trimming/escaping, ordering, navigation markup,
health, and persistence across server restarts.
