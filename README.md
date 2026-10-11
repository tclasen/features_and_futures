# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; the defaults are
port `8080` and database `data/workboard.sqlite`. Keep the SQLite file to retain
projects, tasks, completion state, priorities, due dates, and project defaults across restarts. `GET /health` returns
`{"status":"ok"}`.

Open a project to create tasks, change completion with each task's checkbox, and
filter tasks by All, Open, or Completed. Priority filter offers All, Low, Normal,
and High. Tasks must match both filters and any applied due range, and appear in creation order. Changing
either filter preserves the other selection; task edits immediately update the
matching rows and retain both selections. Opening a project from the list starts
with both filters set to All. Filters remain usable in archived projects and do
not change saved data or completion summaries. Tasks belong to one project at a time.

The project list starts with Active projects. Use Project filter to view Archived
projects and restore them. Archived project pages show their tasks and allow
filtering, while task creation and completion controls are disabled. Each project
row summarizes completed tasks out of all its tasks. Archive state persists, and
existing databases are upgraded automatically without losing projects or tasks.

Use New project name and Rename project on an active project page to rename it.
Names are trimmed and must not be blank. Renaming preserves the project URL,
creation order, tasks, and completion summary. Archived projects cannot be renamed
until restored. Project names persist across restarts.

Each task row has New task title and Rename task controls. Titles are trimmed and
must not be blank. Renaming preserves ownership, creation order, completion state,
filter membership, and completion summaries. Archived projects disable task
renaming until restored. Renamed titles persist across restarts.

Each task row has a Task priority selector with Low, Normal, and High options.
Existing tasks default to Normal. Changes save immediately and persist
across restarts without changing task order, ownership, completion, or summaries.
Renaming preserves priority. Archived projects disable priority controls until
restored, retaining their saved values.

Each project has a Default task priority selector with Low, Normal, and High
options, initially Normal. Changes save immediately and apply only to tasks
created afterward in that project. Existing tasks and both filter selections
remain unchanged. Defaults persist through renaming, restarts, archival, and
restoration. Archived projects display the saved default with the selector disabled.

Each task has a Task due date textbox and Save due date button. Enter a real
Gregorian date in YYYY-MM-DD format (years 0001–9999), or leave it blank to clear
the date. Surrounding whitespace is trimmed. Invalid dates show an alert and
preserve the saved date. Due dates persist without timezone conversion and leave
other task data and filters unchanged. Archived projects disable due-date edits
until restored.

Use Due from, Due through, and Apply due range to filter by inclusive calendar
boundaries. Leave either boundary blank for no limit on that side. With both
blank, all dates and undated tasks match; with either boundary set, undated tasks
are excluded. The range intersects Task filter and Priority filter and survives
filter changes and task edits. Invalid dates or a reversed range show an alert
and retain the previously applied range and matching rows. Range controls remain
usable in archived projects. Opening a project from the list starts with both
boundaries empty. Filters never change saved tasks or completion summaries.

Each task row has Destination project and Move task controls. Destinations are
other active projects, using their current names in project creation order.
Moving to a project for the first time appends the task after all positions
already established there. Returning to a previous project restores the task's
remembered position relative to that project's other tasks, even when multiple
tasks return in a different order. Moves preserve the current identity, title,
completion, priority, and due date. The source page stays open with its filters
and applied range retained; both project summaries reflect the move. New tasks
append after all established positions, including temporarily absent tasks.
Remembered positions and moves persist across restarts. Archived
projects cannot send or receive tasks. Move controls are disabled in archived
projects and when no eligible destination exists.

Use Project search and Search projects to find project names within the selected
Active or Archived list. Use Task search and Search tasks to find task titles
within the selected completion, priority, and due-range filters. Searches trim
surrounding query whitespace and ignore ASCII letter case; internal whitespace
remains significant. Blank queries match everything allowed by the other filters.
Applied searches stay selected through filter changes and task edits, including
moves, and do not change saved data or all-task summaries. Search remains usable
in archived projects. Opening a project from the list starts with an empty task
query; opening the list or returning with Projects starts with an empty project
query.

Run the integration checks:

```sh
npm test
```

The checks use a temporary SQLite file and verify validation, creation order,
project pages, safe rendering, task completion and filters, project isolation,
health, database migration, archive/restore, completion summaries, archived write
protection, project and task renaming with identity and data preservation, task
priority defaults and independence, project default migration and inheritance,
combined completion and priority filtering,
due-date calendar validation and clearing, selection preservation through edits
and validation, inclusive due-range intersections and invalid-range preservation,
task moves with first-arrival and remembered return ordering, migration of
existing order, destination eligibility, filter retention and
data preservation, project/task search matching and filter intersections, query
retention through edits and errors, navigation resets, and persistence after
server restarts.
