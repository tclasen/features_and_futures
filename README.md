# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. Defaults: port `8080`, database `data/workboard.sqlite`. Keep the configured SQLite file to preserve projects, tasks, and completion state across restarts.

Open `/` to create and open projects. Each project page lets you create tasks, toggle completion, and filter by All, Open, or Completed. `GET /health` returns `{"status":"ok"}`.

## Checks

```sh
npm test
node --check server.js
```

Tests use temporary SQLite databases and verify validation, creation order, escaping, navigation markup, health, project isolation, task filters, completion changes, and persistence across process restarts.
