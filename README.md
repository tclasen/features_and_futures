# Workboard

Requires Node.js 22.22.1; no external dependencies.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The server binds to `0.0.0.0`. Keep the SQLite file to preserve projects, tasks, and completion state across restarts.

Health: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests exercise project and task validation, ordering, escaped rendering, project detail navigation, task filtering and ownership, completion updates, health, and persistence across server restarts using isolated SQLite databases that are removed afterward.
