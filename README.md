# Workboard

Requires Node.js 22.22.1. There are no external dependencies.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). SQLite data is
stored at `DB_PATH` (default `data/workboard.sqlite`). Parent directories are
created automatically. Reuse the same database path to preserve projects,
their tasks, task completion state, archive state, and project priority defaults.
Project names, including later renames, persist at the same project URL.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The application uses server-rendered
HTML forms; project names and task titles are trimmed on the server and escaped
for display. Each project has its own tasks, with All, Open, Completed, and Deleted
filters, combined with a Priority filter offering All, Low, Normal, and High.
Only tasks matching all applied filters appear, in creation order. Both comboboxes default
to All when opening a project from the list. Changing a checkbox or task priority
saves immediately and refreshes matching tasks without resetting either filter.
Renaming also retains both selections. Filters stay usable in archived projects
and never change saved task data or the completion summary. Browser JavaScript
submits these controls, with explicit submit buttons available without JavaScript.

The project list defaults to Active; select Archived to open or restore archived
projects. Archiving preserves all tasks and makes task creation and completion
read-only until restoration. Each project summary counts every live task regardless
of task filters. Existing databases are migrated automatically, preserving IDs
and treating existing projects as active.

Active project pages provide a New project name field and Rename project button.
Renaming trims whitespace and preserves the project's identity, creation order,
tasks, and summary. Empty names are rejected. Archived projects disable renaming
and reject rename requests until restored.

Each task row has a Task priority selector with Low, Normal, and High options.
Tasks without stored priorities receive Normal on upgrade. Changing priority saves immediately
and preserves task ownership, order, title, and completion. Priorities persist
across restarts and task renames. Archived projects disable priority controls
and reject priority changes until restored. Database upgrades add the default
priority without replacing existing projects or tasks.

Each project has a Default task priority selector offering Low, Normal, and High.
New and existing projects initially use Normal. Changing the default saves it for
that project and affects only tasks created afterward; existing tasks and both
selected filters remain unchanged. Defaults survive restarts, project renames,
archival, and restoration. Archived projects display the saved default in a
disabled selector and reject changes until restored.

Each task row provides a New task title field and Rename task button. Renaming
trims whitespace and preserves the task's project, creation order, completion
state, and filter membership. Empty titles are rejected with an alert. Renamed
titles persist across restarts. Archived projects disable task rename controls
and reject rename requests until restored.

Each task row has a Task due date textbox and Save due date button. Dates are
optional: saving an empty or whitespace-only value clears the date. Nonempty
values are trimmed and must be real Gregorian calendar dates in `YYYY-MM-DD`
format, with years from `0001` through `9999`. Invalid dates show an alert and
preserve the saved date. Dates represent calendar days without timezone conversion.
Saving dates preserves both selected filters and all other task data. Dates
survive renaming, reloads, and process restarts; existing databases migrate with
empty dates. Archived projects disable these controls and reject saves until
restored.

Each project page also provides Due from and Due through textboxes and an Apply
due range button. Boundaries use the same Gregorian date rules as task dates and
are inclusive. An empty boundary is unbounded; with either boundary set, undated
tasks are excluded. Clearing both boundaries includes dated and undated tasks.
The range intersects completion and priority filters without changing saved data
or the all-live-task summary. Invalid or reversed ranges show an alert and preserve
the previously applied range. Task edits immediately refresh matching rows;
creation, renames, and project-default changes preserve all applied filters.
Range controls remain usable while archived. Applied ranges are carried in the
project URL and forms; opening a project from the list starts with empty boundaries.

Each task row provides a Destination project selector and Move task button. It
lists only other active projects, using their current names in project creation
order. With no eligible destinations both controls are disabled. Moving keeps
the source page open with all applied filters, transfers the same task identity
and saved data. First-time arrivals append after all positions established in the
destination; returning tasks reuse their previous positions, even when several
tasks return in a different order. New tasks also follow all established positions,
including positions reserved for tasks currently elsewhere. Project summaries
reflect current ownership. Remembered per-project positions survive restarts,
renames, archives, and restoration. Existing databases seed the position history
from their current task order; movements before this upgrade have no saved history.
Task creation and movement update current ownership and position history atomically.
Archived projects disable moving and cannot be sources or destinations. Invalid
or stale destinations are rejected without changing task data.

Project search and Task search apply substring queries, ignoring ASCII
letter case and trimming surrounding query whitespace. For matching only, runs
of ASCII spaces and horizontal tabs in queries and saved names/titles become one
space. Other internal whitespace and non-ASCII case remain significant. Stored
names/titles and their displayed text are unchanged. Blank queries match everything. Project
search intersects Active/Archived; task search intersects completion, priority,
and the applied due range. Searches preserve ordering and all-live-task summaries.
Applied queries travel in URLs and forms, so filter changes and task edits retain
them while immediately refreshing membership. Search remains usable in archived
projects. Opening a project from the list, or returning through Projects, begins
with an empty query. Searches never modify stored projects or tasks.

Each task row provides a multiline Task notes textarea and Save notes button.
Notes are plain text, preserving whitespace, line breaks, Unicode, and literal
markup; saving empty text clears them. Notes persist through restarts, renames,
and moves without changing other task data or remembered order. Saving retains
all applied filters and search, and notes do not contribute to search matches.
Archived projects display saved notes but disable editing and reject saves until
restored. Database upgrades initialize notes to empty without replacing task data.

Live task rows provide Delete task; the Deleted filter shows deleted tasks with
Restore task. Deletion preserves every field and remembered project position,
but removes the task from All, Open, Completed, and completion summaries.
Deleted rows intersect the same priority, due range, and title search filters;
their editing and move controls are read-only. Restoration reuses the reserved
position, including ahead of tasks created later, and retains all applied filters.
Archived projects allow viewing deleted tasks but reject deletion and restoration.
Deletion state survives restarts; upgrades initialize existing tasks as live.
