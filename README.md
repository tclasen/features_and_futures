# Workboard

Requires Node.js 22.22.1. No dependencies or installation step are needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH`
defaults to `./data/workboard.sqlite`. Parent database directories are created
automatically. Keep the database file to preserve projects, tasks, and completion
state and archive status across restarts. Existing databases are upgraded
automatically, with existing projects remaining active. `GET /health` returns `{"status":"ok"}`.

Open a project to create tasks, check or uncheck their completion, and filter
the list by All, Open, or Completed. Lists display items in creation order.

The project list defaults to Active. Archive a project to move it to Archived,
then restore it from that list when needed. Archived projects allow viewing and
filtering tasks but disable task creation and completion changes. Each project
row shows completed/total counts across all of its tasks. The API also rejects
task writes to archived projects with HTTP 409.

Use New project name and Rename project on an active project page to rename it.
Names are trimmed and must be nonblank. Renaming preserves the URL, list order,
tasks, and completion counts, and the new name persists across restarts. Archived
projects disable renaming until restored. `PATCH /api/projects/<id>` accepts
either `{ "name": "New name" }` or `{ "archived": true }` in separate requests;
renaming an archived project returns HTTP 409.

Run the integration tests with `npm test`. Tests use temporary databases outside
the repository and clean up their server processes and files.
