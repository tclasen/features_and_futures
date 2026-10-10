# Workboard

Requires Node.js 22.22.1. No packages need to be installed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). Set `DB_PATH`
to the SQLite file to retain projects, archive state, defaults, tasks, priorities, due dates, and completion state across
restarts; the default is `data/workboard.sqlite`. Its parent directory is created automatically.
`GET /health` returns `{"status":"ok"}`.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

Tests use temporary databases outside the repository and remove them afterward.

The project list starts with Active projects; switch Project filter to Archived to
open or restore an archived project. Archived project tasks can be viewed and
filtered, but creation and completion changes are disabled. Completion summaries
count every task in each project. Existing databases are migrated automatically.

On an active project page, use New project name and Rename project to change its
name. Names are trimmed and cannot be blank. Renaming preserves the project's URL,
list position, tasks, and completion summary. Archived projects must be restored
before they can be renamed.

Each task row provides New task title and Rename task. Titles are trimmed and
cannot be blank. Renaming preserves ownership, creation order, completion state,
and completion summaries. Task rename controls are disabled while the project
is archived and become available after restoration.

Each task has a Task priority dropdown with Low, Normal, and High options.
Existing tasks retain their saved priority. Priority is saved independently for
each task and survives renaming, completion changes, and restarts. Archived
projects disable priority edits; restoration preserves the saved priorities.

Project pages start with All selected in both Task filter and Priority filter.
Tasks must match both filters and retain their creation order. Changing either
filter preserves the other selection. Completion and priority edits immediately
update which rows match; renaming preserves both selections. Both filters remain
available on archived projects. Filters do not change saved data or summaries.

Default task priority saves a separate Low, Normal, or High default for each
project. Existing and new projects initially use Normal. New tasks inherit the
project's saved default; changing it never updates existing tasks or either
filter. The default survives renaming and restarts. Archived projects show it
in a disabled dropdown, and restoration enables editing again.

Each task has an optional Task due date textbox and Save due date button. Use a
real Gregorian date in YYYY-MM-DD format (years 0001–9999), or leave it blank to
clear the saved date. Surrounding whitespace is trimmed. Invalid dates show an
alert and preserve the saved date. Dates are calendar days without timezone
conversion and survive other edits and restarts. Archived projects disable date
editing; restoration preserves dates and enables editing again.

Due from and Due through apply an inclusive due-date range alongside the
completion and priority filters. Either blank boundary is unbounded; with both
blank, undated tasks also match. Enter valid YYYY-MM-DD dates and select Apply
due range. Invalid dates or reversed boundaries show an alert and leave the
previous applied range intact. Editing the textboxes alone does not apply a
range. Task edits immediately update matching rows while preserving all filters.
Range controls remain available in archived projects. Reopening a project starts
with empty boundaries; filters never change saved task data or completion summaries.

Destination project lists other active projects in project creation order. Move
task appends the task to the chosen project's tasks, preserving its identity,
title, completion, priority, and due date. The source page and all its filters
remain selected. Both summaries reflect the new ownership. Moving is disabled
for archived projects or when there are no eligible destinations. Existing
task order is preserved when migrating older databases; new and moved tasks
append after the destination's current tasks.

`POST /api/projects/:projectId/tasks/:taskId/move` accepts
`{"destinationProjectId":123}`. Source and destination must be different active
projects. Moves update ownership and order together in a SQLite transaction;
invalid requests leave both projects unchanged.
