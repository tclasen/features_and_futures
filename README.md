# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`; parent directories are
created automatically. Keep the database file to preserve projects, tasks, and
completion and archive state across restarts. Existing databases are migrated
without losing projects or tasks.

Open a project to create tasks, toggle their completion, and filter by All, Open,
or Completed. Each project has its own tasks; filtering does not change saved data.
The project list defaults to Active; switch to Archived to open or restore archived
projects. Archived projects retain their tasks but cannot create tasks or change
completion until restored. Project rows summarize completed tasks out of all tasks.
Active project pages also let you rename a project. Names are trimmed and must not
be blank; renaming preserves the URL, creation order, tasks, and summary. Archived
projects cannot be renamed until restored. Renamed names persist across restarts.
Each task row also lets you rename its title. Titles are trimmed and must not be
blank; renaming preserves task ownership, creation order, completion, filter
membership, and project summaries. The completion checkbox label follows the new
title. Archived projects disable task renaming until restored. Task titles persist
across restarts.
Each task has a Task priority selector with Low, Normal, and High options. Existing
tasks default to Normal when migrated; new tasks inherit their project's saved default. Priority changes persist independently without
changing completion, ownership, order, or summaries, and renaming preserves priority.
Archived projects disable priority edits until restored.
Project pages also have a Priority filter (All, Low, Normal, High), initially All.
It combines with the completion filter and keeps matching tasks in creation order.
Changing a task's completion or priority immediately reapplies both filters;
renaming and other task edits retain both selections. Filtering never changes
saved data or completion summaries. Both filters remain usable when archived.
Each project also has a Default task priority selector (Low, Normal, High), initially
Normal. Changes affect only subsequent new tasks in that project, never existing
tasks or either filter selection. Defaults persist through reloads, restarts,
renaming, archival, and restoration. Archived projects disable default edits until
restored.

Each task has an optional Task due date textbox and Save due date button. Dates
are trimmed and must be real Gregorian calendar dates in YYYY-MM-DD format, with
years 0001–9999. Empty or whitespace-only input clears the date. Invalid dates
show an alert and leave the saved date unchanged. Dates persist independently,
without timezone conversion or changes to other task data, filters, or summaries.
Archived projects disable due-date editing until restored.

Project pages have Due from and Due through textboxes and an Apply due range
button. Boundaries use the same calendar-date rules as task due dates and are
inclusive; a blank boundary is unbounded. With either boundary set, undated tasks
are excluded. Empty boundaries include all dates and undated tasks. The applied
range intersects completion and priority filters without changing saved data or
summaries. Invalid dates or reversed boundaries show an alert and leave the
previous applied range intact. Task edits immediately reapply all three filters;
renaming, creation, and default changes retain them. Range controls remain usable
when archived. Reopening a project starts with empty boundaries and All selected
for both task filters. Range selections are page-local, not persisted.

Every task row has a Destination project selector and Move task button. Destinations
are other active projects in project creation order, using their current names.
Moving to a project for the first time appends the task after all positions already
established there. Returning to a previous project restores its remembered position
relative to other tasks, even when tasks return in a different order. Each project's
positions remain reserved while tasks are away. Moves preserve current identity,
title, completion, priority and due date; returning never restores older field values. The source remains open with all filters retained;
both summaries reflect current ownership. Archived projects cannot send or receive
tasks, and moving is disabled when no eligible destination exists. Moves and ordering
persist across reloads and restarts; destination defaults do not affect moved tasks.
The order migration preserves existing tasks' current order; visits before this
feature was introduced cannot be reconstructed. Project renaming, archival and
restoration preserve remembered positions.

Project search and Task search apply trimmed substring queries with ASCII-only
case-insensitive matching; internal whitespace remains significant. Blank queries
match all rows. Project search intersects Active/Archived; task search intersects
completion, priority, and applied due range. Edits immediately reapply the retained
query without changing other filters, ordering, saved data, or summaries. Search
remains usable in archived projects. Opening either page (including returning via
Projects) starts with an empty query; queries are page-local, not persisted.

Health check: `GET /health` returns `{"status":"ok"}`.

Run automated UI-control, HTTP, and persistence tests with `npm test`. Server tests use a temporary
SQLite database and verify validation, creation order, project lookup, page/asset
routes, task ownership, completion updates, archive/restore restrictions, summaries,
project and task rename validation and identity preservation, independent task priorities,
priority validation and archive restrictions, combined priority/completion filtering,
filter retention and immediate row updates after edits, independent project defaults,
new-task inheritance, default validation and archive protection, due-date validation,
clearing, independence, filter retention and archive protection, inclusive due-range intersections,
invalid-range preservation, live membership updates, archived range controls, shared date-validator serving,
legacy database migration, move destination eligibility, first-arrival append ordering,
remembered per-project positions, reverse-order returns, reserved absent positions,
source filter retention, ownership and summary updates, search matching and filter intersections,
search retention after edits, and persistence through process restarts.
