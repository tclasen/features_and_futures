# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. Defaults are port 8080 and `data/workboard.sqlite`; reuse the database path to retain projects across restarts.

Health check: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests launch isolated servers and temporary SQLite databases, checking project creation, validation, ordering, HTML escaping, navigation markup, health, and persistence across process restarts.
