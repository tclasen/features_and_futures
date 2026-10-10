# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`; `GET /health` returns `{"status":"ok"}`.
Projects are stored in the configured SQLite file, which must be retained across restarts.

Verify:

```sh
npm test
```

Tests use a temporary SQLite database outside the repository and check health,
validation, ordering, safe rendering, navigation, and persistence across restarts.
