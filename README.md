# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step are needed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`) and the SQLite file
at `DB_PATH` (default `data/workboard.sqlite`). The database directory is created
automatically. Keep this file to preserve projects, tasks, completion state, and
archive state across restarts. Existing databases are migrated automatically.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. Projects are created through
the home page and can be opened individually. Blank names are rejected; names
are trimmed and displayed safely as text. Each project has its own tasks, with
completion checkboxes and an All/Open/Completed filter. Blank task titles are
rejected and titles are trimmed. Pages use standard HTML forms; JavaScript
submits completion and filter changes automatically. Project URLs work on reload.
The project list starts with Active projects and can show Archived projects.
Archiving makes a project's tasks read-only; restoring permits edits again.
Each project row shows the completed count out of all its tasks.
Active projects can be renamed with surrounding whitespace trimmed. Blank names
are rejected. Renaming preserves the project's URL, list position, tasks, and
completion state, and the new name persists across restarts. Archived projects
cannot be renamed until restored.
Each task can also be renamed within its row. New titles are trimmed and blank
titles are rejected. Renaming preserves task order, ownership, completion state,
and filter membership. Task rename controls are disabled while the project is
archived, and renamed titles persist across restarts.
Each task has a Low/Normal/High priority. Tasks without a saved priority migrate
to Normal; new tasks inherit their project's saved default. Priority changes are
saved automatically and persist across restarts without changing task order,
completion, ownership, or summaries.
Renaming preserves priority. Archived projects disable priority edits until
restored; the server also rejects direct edits to archived tasks.
The Priority filter (All/Low/Normal/High) combines with the Task filter: tasks
must match both, and matching tasks retain creation order. Both selections stay
in place when either filter changes or a task is edited; completion and priority
changes immediately update the matching rows. Filters also work in archived
projects. Opening a project from the list starts both filters at All. Filters
are page state stored in the URL and never change task data or summary counts.
Each project has a Default task priority (Low/Normal/High), initially Normal.
Changes save automatically and apply only to tasks created afterward in that
project. Defaults persist across restarts, renaming, archival, and restoration.
Changing a default preserves both filters, existing tasks, and summary counts.
Archived projects show their saved default with the control disabled; the server
also rejects direct changes until restoration.
Each task has an optional Task due date textbox and Save due date button.
Dates are trimmed and must be real Gregorian calendar days in YYYY-MM-DD format
with years 0001–9999. Empty or whitespace-only input clears a date. Invalid dates
show an alert and leave saved data unchanged. Dates have no timezone conversion,
persist across restarts, and survive renaming, archival, and restoration.
Saving dates preserves both filters and all other task data. Archived projects
disable due-date controls and reject direct date edits until restored.
Due from and Due through apply an inclusive date range that intersects completion
and priority filters. Blank boundaries are unbounded; undated tasks match only
when both boundaries are blank. Invalid dates or reversed ranges show an alert
and preserve the previously applied range. Applying a range never edits task data.
Task edits immediately re-evaluate membership, and all edits retain the three
filters. Range controls remain usable in archived projects. Applied boundaries
are page state in the URL, preserved on reload; reopening from the project list
starts with empty boundaries.
Each task can move to another active project through Destination project and
Move task. Destinations use current project names in project creation order.
Moves retain task identity, title, completion, priority, and due date, appending
at the destination without applying its default priority. The source stays open
with all filters intact, and both summaries reflect current ownership. Ordering
and ownership persist across restarts. Archived projects cannot send or receive
tasks; move controls also disable when there are no eligible destinations.
