# Workboard

Requires Node.js 22.22.1. No dependencies need installing.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to
choose the persistent SQLite file (default `data/workboard.sqlite`). Parent
directories are created automatically. `GET /health` returns `{"status":"ok"}`.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
npm test
npm run check
```

Projects are stored in creation order with stable, automatically assigned IDs.
The browser uses `/api/projects` to list and create projects and
`/api/projects/:id` to load a project. Names are trimmed and must be nonblank.

Each project page supports creating tasks, changing completion, and filtering
by All, Open, or Completed. Task titles are trimmed and must be nonblank.
Tasks are listed and created at `/api/projects/:id/tasks`; update completion
with `PATCH /api/projects/:id/tasks/:taskId` and a JSON body such as
`{"completed":true}`. Tasks belong to their project, remain in creation order,
and persist with their completion state in the configured database.

The project list initially shows Active projects; select Archived to open or
restore archived projects. Each row shows completed/total task counts. Archive
or restore with `PATCH /api/projects/:id` and `{"archived":true}` or
`{"archived":false}`. Archived project pages retain task filtering but disable
task creation and completion changes; the API also rejects these writes with
HTTP 409. Existing databases are migrated automatically, preserving IDs and
tasks. Archive state and summaries survive process restarts.
