# Workboard

Requires Node.js 22.22.1. No dependencies need to be installed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. Configure the port and persistent
SQLite database location with environment variables:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Each project page lets you create tasks,
toggle completion, and filter by All, Open, or Completed. The project list shows
completion summaries and filters Active or Archived projects. Archive and restore
buttons preserve project tasks; archived project pages allow viewing and filtering
tasks with creation and completion disabled. Projects, archive state, and tasks
persist in the configured SQLite database, including when upgrading an existing
database. `GET /health` returns `{"status":"ok"}`.

Active project pages also let you rename a project. Names are trimmed and must
not be blank. Renaming preserves the project URL, list position, and tasks;
archived projects must be restored before they can be renamed.

Each task row also lets you rename its task with a trimmed, nonblank title.
Renaming preserves ownership, creation order, completion, and summaries, and
updates the completion checkbox label. Archived tasks must be restored with their
project before they can be renamed.

Each task has a Task priority selector with Low, Normal, and High options.
Existing tasks default to Normal. Priorities persist independently across
renames and restarts; archived projects disable priority edits until restored.

Run the integration checks with `npm test`.

Project pages also offer a Priority filter with All, Low, Normal, and High options.
Tasks must match both the completion and priority filters and retain creation
order. Both selections stay in place during task edits, which immediately update
the matching rows. Opening a project from the list starts both filters at All.
Filters remain usable while archived and never change completion summaries.

Each project has a Default task priority selector with Low, Normal, and High
options, initially Normal. New tasks inherit that project's saved default;
changing the default leaves existing tasks and both filter selections unchanged.
Defaults persist independently across renames and restarts. Archived projects
display their saved default with editing disabled until restored.

Each task row has an optional Task due date textbox and Save due date button.
Dates must be real Gregorian calendar days in YYYY-MM-DD format, with years
0001 through 9999. Surrounding whitespace is trimmed; an empty value clears the
date. Invalid values show an alert and preserve the saved date. Due dates persist
across renames and restarts without changing tasks or filters. Archived projects
disable due-date editing until restored.

Due from and Due through apply an inclusive date range alongside the completion
and priority filters. Blank boundaries are unbounded; undated tasks match only
when both boundaries are blank. Invalid ranges preserve the applied filters.

Each task row offers Destination project and Move task controls. Destinations
are other active projects in project creation order. Moving to a new destination
appends the task after all positions established there. Returning to a previous
project restores the task's remembered position, including when multiple tasks
return in a different order. Moves preserve title, completion, priority and due date,
and keeps the source page open with its filters unchanged. Task order and
ownership persist across restarts. Archived projects cannot send or receive
tasks; moving is also disabled when there are no eligible destinations.

Remembered positions persist separately for each project across restarts,
project renames, archival and restoration. Existing databases retain their
current task order on upgrade. Newly created tasks follow all established
positions, including positions belonging to tasks currently in another project.

Project search and Task search apply trimmed substring queries, ignoring ASCII
letter case and treating each run of ASCII spaces and tabs as one space in both
queries and names/titles. Stored names and titles keep their original whitespace
and case. Project search intersects the
Active/Archived filter. Task search intersects completion, priority and applied
due range; edits retain every applied filter and immediately update matching
rows. Searching never changes saved data or summary counts. Archived pages still
allow searching. Opening a project or returning with Projects starts a fresh
search; reloading a filtered URL retains its query.
