# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. Defaults are port 8080 and `data/workboard.sqlite`; reuse the database path to retain projects, tasks, and completion state across restarts.

Health check: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests launch isolated servers and temporary SQLite databases, checking project and task creation, validation, ordering, HTML escaping, navigation markup, task filtering, project isolation, health, and persistence across process restarts.

On a project page, create tasks, toggle their completion checkboxes, and choose All, Open, or Completed in Task filter. Filter changes and completion changes submit automatically.
