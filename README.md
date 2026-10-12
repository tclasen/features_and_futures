# Workboard

Requires Node.js 22.22.1. There are no external dependencies.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). SQLite data is
stored at `DB_PATH` (default `data/workboard.sqlite`). Parent directories are
created automatically. Reuse the same database path to preserve projects,
their tasks, task completion state, and archive state.
Project names, including later renames, persist at the same project URL.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The application uses server-rendered
HTML forms; project names and task titles are trimmed on the server and escaped
for display. Each project has its own tasks, with All, Open, and Completed
filters, combined with a Priority filter offering All, Low, Normal, and High.
Only tasks matching both filters appear, in creation order. Both filters default
to All when opening a project from the list. Changing a checkbox or task priority
saves immediately and refreshes matching tasks without resetting either filter.
Renaming also retains both selections. Filters stay usable in archived projects
and never change saved task data or the completion summary. Browser JavaScript
submits these controls, with explicit submit buttons available without JavaScript.

The project list defaults to Active; select Archived to open or restore archived
projects. Archiving preserves all tasks and makes task creation and completion
read-only until restoration. Each project summary counts every task regardless
of task filters. Existing databases are migrated automatically, preserving IDs
and treating existing projects as active.

Active project pages provide a New project name field and Rename project button.
Renaming trims whitespace and preserves the project's identity, creation order,
tasks, and summary. Empty names are rejected. Archived projects disable renaming
and reject rename requests until restored.

Each task row has a Task priority selector with Low, Normal, and High options.
New and existing tasks default to Normal. Changing priority saves immediately
and preserves task ownership, order, title, and completion. Priorities persist
across restarts and task renames. Archived projects disable priority controls
and reject priority changes until restored. Database upgrades add the default
priority without replacing existing projects or tasks.

Each task row provides a New task title field and Rename task button. Renaming
trims whitespace and preserves the task's project, creation order, completion
state, and filter membership. Empty titles are rejected with an alert. Renamed
titles persist across restarts. Archived projects disable task rename controls
and reject rename requests until restored.
