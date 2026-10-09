# Workboard

Requires Node.js 22.22.1. No dependencies or install step are needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. Defaults are port 8080 and `data/workboard.sqlite`. Keep the configured database file to preserve projects across restarts.

Health endpoint: `GET /health` returns `{"status":"ok"}`.

Run the integration test (uses a temporary SQLite database):

```sh
npm test
```
