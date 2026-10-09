# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite modules with no external dependencies.

```sh
npm start
```

The server listens on `0.0.0.0`, using `PORT` (default `8080`). Set `DB_PATH` to choose the persistent SQLite file (default `data/workboard.sqlite`). Parent directories are created automatically.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

Visit `/` to create and open projects. `GET /health` returns `{"status":"ok"}`. Project creation trims names and rejects blank names without inserting a row. Projects are listed by their persistent creation IDs. The Project filter initially shows Active projects; select Archived to open or restore archived projects. Each row shows completed/total task counts, including all tasks regardless of the Task filter.

On a project page, create tasks with trimmed, nonblank titles. Each task belongs to that project and starts open. Use its checkbox to save completion and the Task filter to show All, Open, or Completed tasks in creation order. Opening a project initially shows All; task creation and completion preserve the current filter. Archived projects remain viewable and filterable, with task creation and completion disabled; the server also rejects task edits with HTTP 403. Restoring a project enables edits without losing tasks. Project URLs, archive state, task titles, and completion state survive reloads and server restarts. Existing project databases are upgraded automatically without changing project IDs, names, or tasks.

`npm test` verifies project behavior, task validation and filtering, project ownership, safe HTML rendering, existing-database upgrades, archive/restore behavior, completion summaries, archived edit restrictions, and persistence across server restarts. Tests use temporary databases outside the repository and remove them afterward.
