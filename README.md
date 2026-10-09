# Workboard

A project board built with Node.js 22.22.1, built-in HTTP and SQLite, and browser JavaScript. No installation or external dependencies are needed.

## Run

```sh
npm start
```

The server binds to `0.0.0.0` using `PORT` (default `8080`). `DB_PATH` selects the persistent SQLite file (default `./data/workboard.sqlite`). Parent directories are created automatically. For example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`. Project names are trimmed and must be nonblank; project IDs remain stable across restarts. The JSON endpoints are `GET/POST /api/projects` and `GET /api/projects/:id`; creation accepts `{ "name": "Project name" }`.

Project pages support task creation, completion checkboxes, and an All/Open/Completed filter (initially All). Titles are trimmed and must be nonblank. Tasks belong to one project and persist with their completion state.

Task JSON endpoints: `GET/POST /api/projects/:id/tasks` (creation accepts `{ "title": "Task title" }`) and `PATCH /api/projects/:id/tasks/:taskId` (accepts `{ "completed": true }` or `false`). Missing projects or tasks return 404; invalid input returns 400. Task lists are returned in creation order with boolean completion values.

The project list starts with Active projects; select Archived to open or restore archived projects. Each row includes a completion summary counting all of its tasks. Archiving preserves tasks and completion state. Archived pages allow viewing and filtering tasks, but disable creation and completion changes.

`PATCH /api/projects/:id` accepts `{ "archived": true }` to archive or `false` to restore. Project JSON includes `archived`, `completedCount`, and `totalCount`. Task mutations on archived projects return 409. Existing databases are upgraded automatically, retaining project IDs and tasks.

## Verify

```sh
npm test
```

Tests launch real server processes with isolated temporary SQLite files and verify project/task validation, creation order, project ownership, completion and reopening, archive/restore, summaries, HTTP routes, and persistence after restart. Additional tests cover upgrading existing databases and browser-script behavior using a lightweight DOM double.
