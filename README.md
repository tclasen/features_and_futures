# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite modules and browser HTML,
CSS, and JavaScript; no packages need to be installed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to
8080 and `DB_PATH` defaults to `data/workboard.sqlite`. The database directory is
created automatically. Keep the database file to preserve projects, tasks, archive state, and completion state
across restarts. `GET /health` returns `{"status":"ok"}`.

Run the automated integration checks:

```sh
npm test
```

The tests create a temporary SQLite database, launch and restart the server, and
check project and task validation, creation order, project ownership, completion
updates, archive/restore, completion summaries, migration, health, and persistence.

Project creation uses `POST /api/projects` with JSON `{"name":"Project name"}`.
Names are trimmed; blank or non-string names return HTTP 400. Projects are listed
in creation order by `GET /api/projects`, and individual projects are available
at `GET /api/projects/<id>`. The browser opens projects at `/projects/<id>`.

Each project page supports task creation, completion checkboxes, and an `All`,
`Open`, or `Completed` task filter. The filter starts at `All` on page load and
preserves creation order. Task titles are trimmed; blank titles show an alert.

Tasks use `GET /api/projects/<id>/tasks` to list and `POST` on the same URL with
JSON `{"title":"Task title"}` to create an open task. Update completion with
`PATCH /api/projects/<id>/tasks/<task-id>` and JSON `{"completed":true}` or
`{"completed":false}`. Completion must be a boolean. Task routes are scoped to
their project; unknown projects or task IDs return HTTP 404. Existing project
databases receive the tasks table automatically at startup.

The project list starts with the `Active` project filter; choose `Archived` to
view archived projects and restore them. Every project row shows the completed
task count out of all its tasks, independent of task filtering. Archived project
pages remain accessible and support task filtering, with creation and completion
controls disabled. Restoring preserves task titles, order, and completion state.

Project responses include `archived` (boolean), `completed` (completed task count),
and `total` (total task count). Archive or restore using
`PATCH /api/projects/<id>` with JSON `{"archived":true}` or `{"archived":false}`.
Non-boolean archive values return HTTP 400. Task creation and completion updates
on archived projects return HTTP 409. Existing databases receive the archive
column with an active default at startup, preserving project and task IDs.
