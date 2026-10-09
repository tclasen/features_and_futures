# Workboard

A dependency-free project board using Node.js 22.22.1, built-in HTTP and SQLite, and browser JavaScript.

## Run

```sh
npm start
```

The server binds to `0.0.0.0` at `PORT` (default `8080`). `DB_PATH` selects the SQLite file (default `data/workboard.sqlite`); parent directories are created automatically. Keep that file to preserve projects and tasks across restarts. Existing project databases are upgraded automatically without changing project IDs or names.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The browser uses `GET /api/projects`, `POST /api/projects` with JSON `{ "name": "…" }`, and `GET /api/projects/:id`. Names are trimmed and must be nonblank. IDs are stable, and the list is in creation order.

Project pages support task creation, completion toggles, and All/Open/Completed filtering in creation order. The task API uses `GET /api/projects/:id/tasks`, `POST /api/projects/:id/tasks` with JSON `{ "title": "…" }`, and `PATCH /api/projects/:id/tasks/:taskId` with JSON `{ "completed": true }` (or `false`). Titles are trimmed and must be nonblank; completion must be a boolean. Task access is scoped to the owning project.

The integration tests launch the real server against temporary databases and verify health, validation, ordering, detail routes, task ownership, completion updates, upgrading an existing database, and process-restart persistence. Run them with `npm test`.
