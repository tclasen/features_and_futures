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
The Priority filter offers All, Low, Normal, and High, initially All. Both filters
apply together and keep their selections when tasks are renamed or their priority
or completion changes. Saved edits immediately update the matching rows. Filters
remain usable in archived projects and never change saved data or completion counts.

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

Each task row provides New task title and Rename task. Titles are trimmed and
must be nonblank. Renaming preserves task identity, ownership, creation order,
completion state, and completion counts. Archived projects disable task renaming
until restored. `PATCH /api/projects/<project-id>/tasks/<task-id>` accepts either
`{ "title": "New title" }`, `{ "completed": true }`, or `{ "priority": "High" }` in separate requests.
Renamed titles persist across restarts; archived task writes return HTTP 409.

Each task has a Task priority select with Low, Normal, and High options. Existing
tasks default to Normal on migration. New tasks inherit their project's saved
default. Priorities persist across restarts independently
of titles, completion, and ownership. Archived projects disable priority changes;
restoring a project preserves its saved priorities and enables editing again.

Default task priority on each project page offers Low, Normal, and High. Existing
and new projects initially use Normal. Changes apply only to subsequently created
tasks in that project, preserving existing tasks, both filters, and summaries.
Defaults persist through renaming, restarts, archive, and restoration. Archived
projects show the saved default with editing disabled. The project API exposes
`defaultPriority`; `PATCH /api/projects/<id>` accepts `{ "defaultPriority": "High" }`
separately from rename or archive requests. Invalid priorities return HTTP 400;
default edits on archived projects return HTTP 409.

Run the integration tests with `npm test`. Tests use temporary databases outside
the repository and clean up their server processes and files.
