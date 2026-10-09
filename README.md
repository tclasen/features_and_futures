# Workboard

Requires Node.js 22.22.1. No installation or external dependencies are needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`. `GET /health` returns `{"status":"ok"}`.
Keep the configured SQLite file to preserve projects across restarts.

Run the integration checks:

```sh
npm test
```

Tests use a temporary database outside the repository and check validation,
creation order, detail lookup, page routes, health, and restart persistence.
