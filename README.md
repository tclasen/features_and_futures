# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the database file to preserve projects, tasks, and completion state across restarts.

Health check: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use temporary SQLite databases and check project/task validation, creation order, HTML escaping, project navigation, task ownership, completion toggles, filtering, and persistence across server restarts.
