# Workboard

A dependency-free project board using Node.js 22.22.1, built-in HTTP and SQLite, and browser JavaScript.

## Run

```sh
npm start
```

The server binds to `0.0.0.0` at `PORT` (default `8080`). `DB_PATH` selects the SQLite file (default `data/workboard.sqlite`); parent directories are created automatically. Keep that file to preserve projects across restarts.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The browser uses `GET /api/projects`, `POST /api/projects` with JSON `{ "name": "…" }`, and `GET /api/projects/:id`. Names are trimmed and must be nonblank. IDs are stable, and the list is in creation order.

The integration test launches the real server against a temporary database and verifies health, validation, ordering, detail routes, and process-restart persistence.
