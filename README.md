# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. Defaults: port `8080`, database `data/workboard.sqlite`. Keep the configured SQLite file to preserve projects across restarts.

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

## Checks

```sh
npm test
node --check server.js
```

Tests use a temporary SQLite database and verify required validation, creation order, escaping, navigation markup, health, and persistence across process restarts.
