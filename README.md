# Workboard

Requires Node.js 22.22.1; no dependencies or install step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `./data/workboard.sqlite`.
The server binds to `0.0.0.0`. `GET /health` returns `{"status":"ok"}`.

```sh
npm test
```

Tests exercise health, project validation, creation order, detail routes, and SQLite persistence across process restarts using a temporary database.
