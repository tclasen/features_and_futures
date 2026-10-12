# Workboard

Requires Node.js 22.22.1; no external dependencies.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The server binds to `0.0.0.0`. Keep the SQLite file to preserve projects across restarts.

Health: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests exercise validation, ordering, escaped rendering, project detail navigation, health, and persistence across server restarts using an isolated SQLite database that is removed afterward.
