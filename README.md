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
Existing tasks default to Normal when migrating from databases without priorities.
Priorities persist independently across
reloads and restarts, including after renaming, archiving, and restoration.
Archived projects disable priority edits until restoration.

Use `Priority filter` (All, Low, Normal, High) together with `Task filter` to
show tasks matching both selections in creation order. Both filters stay selected
through task edits, including when an edited task no longer matches. Filters work
on archived projects and never change saved data or completion totals. Opening
a project from the project list starts both filters at All.

Use `Default task priority` (Low, Normal, High) on each project page to choose
the priority for subsequent tasks. Each project starts at Normal. Changing the
default preserves existing tasks and both selected filters. Defaults persist
independently across reloads, restarts, renaming, archiving, and restoration.
Archived projects show the saved default but disable changes until restoration.

Each task row has a `Task due date` textbox and `Save due date` button.
Save a real Gregorian date in YYYY-MM-DD format (years 0001–9999), or save
an empty value to clear it. Surrounding whitespace is trimmed. Invalid dates
show an alert and preserve the saved date. Dates persist as calendar days,
independently of timezones, and preserve all other task data and both filters.
Archived projects disable date edits until restoration.

Use `Due from`, `Due through`, and `Apply due range` to filter by inclusive
calendar-date boundaries alongside completion and priority. Blank boundaries
are unbounded; undated tasks match only when both boundaries are blank.
Invalid dates or reversed ranges show an alert and retain the applied range.
Edits and filter changes retain the range, and archived projects allow range
filtering. Opening a project from the list starts with empty range boundaries.
Filtering never changes saved task data or the all-task completion summary.

Each task row provides `Destination project` and `Move task` to move it to
another active project. Destinations use current project names in project
creation order. First visits append after all positions established in the
destination; returning tasks resume their remembered position in that project.
Positions are saved independently for each project, even while a task is away,
and survive restarts, project renaming, archival and restoration. Moves preserve
title, completion, priority and due date, and retain the source page's filters.
Both completion summaries reflect the new ownership. Task order and ownership
persist across restarts. Archived projects cannot send or receive tasks; move
controls are also disabled when there are no eligible destinations.

Run the integration checks with:

```sh
npm test
```
