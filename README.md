# Workboard

Requires Node.js 22.22.1. No packages need to be installed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. Configure the port and persistent SQLite database path with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

On a project page, create tasks, toggle their completion checkboxes, and use
`Task filter` to view All, Open, or Completed tasks. Projects and tasks persist
in the configured SQLite file across server restarts.

Use `Project filter` to switch between Active and Archived projects. Project
rows show completion totals and let you archive or restore a project. Archived
projects remain readable with working task filters; task creation and completion
changes are disabled until restoration. Existing databases migrate automatically.

Use `New project name` and `Rename project` on an active project page to rename
it. Names are trimmed and required. Renaming preserves the project's URL,
creation order, tasks, and completion totals. Archived projects must be restored
before they can be renamed.

Each task row provides `New task title` and `Rename task`. Titles are trimmed
and required. Renaming preserves task ownership, creation order, completion,
filter membership, and project completion totals. Archived projects disable
task renaming until restoration. Renamed titles persist across server restarts.

Each task row has a `Task priority` selector with Low, Normal, and High options.
Existing and new tasks default to Normal. Priorities persist independently across
reloads and restarts, including after renaming, archiving, and restoration.
Archived projects disable priority edits until restoration.

Use `Priority filter` (All, Low, Normal, High) together with `Task filter` to
show tasks matching both selections in creation order. Both filters stay selected
through task edits, including when an edited task no longer matches. Filters work
on archived projects and never change saved data or completion totals. Opening
a project from the project list starts both filters at All.

Run the integration checks with:

```sh
npm test
```
