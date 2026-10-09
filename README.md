# Workboard

Requires Node.js 22.22.1. No application dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; `PORT` defaults to 8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Projects are saved to SQLite across restarts. `GET /health` returns `{"status":"ok"}`.

Run the integration tests:

```sh
npm test
```

Tests use a temporary SQLite database and verify validation, creation order, project routes, health, and persistence across process restarts.
