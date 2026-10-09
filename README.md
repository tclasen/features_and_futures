# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the database file to preserve projects across restarts.

Health check: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use a temporary SQLite database and check validation, creation order, HTML escaping, project navigation, and persistence across server restarts.
