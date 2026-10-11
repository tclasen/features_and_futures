# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`.
`PORT` defaults to `8080`; `DB_PATH` defaults to `./data/workboard.sqlite`.
Projects, tasks, completion, priorities, due dates, project defaults, and archive state persist in that SQLite file.
Existing databases are migrated automatically.
Use Project filter to view Active or Archived projects; archive or restore from each row.
Rows summarize completed/total tasks. Archived projects remain readable with task filtering,
but cannot create tasks, change completion, or rename.
Use New project name and Rename project on active project pages to rename without
changing the URL, creation order, or tasks. Names are trimmed and must not be blank.
Each task row provides New task title and Rename task. Task titles are trimmed and
must not be blank; renaming preserves ownership, order, completion, and summaries.
Each task row has a Task due date textbox and Save due date button. Dates are optional:
blank input clears the saved date; otherwise use a real Gregorian YYYY-MM-DD date
(year 0001–9999). Surrounding whitespace is trimmed. Invalid dates show an alert
without changing saved data. Dates persist without timezone conversion, remain
independent per task, and cannot be edited while the project is archived.
Each task row has a Task priority selector: Low, Normal, or High.
Each project has a Default task priority selector, initially Normal. Changing it only
affects tasks created afterward in that project, leaving existing tasks and both filters
unchanged. Defaults survive renaming and restarts; archived projects display the saved
value but disable changes until restored.
Priorities are independent and preserved through renaming, completion changes, and restarts.
Archived projects disable task renaming and priority changes until restored.
Task filter (All/Open/Completed) and Priority filter (All/Low/Normal/High) combine
without resetting each other. Edits immediately re-evaluate matching rows while preserving
both selections and creation order. Filters remain usable on archived projects and never
change the completion summary. Opening from the project list starts both filters at All.
Due from and Due through apply an inclusive date range with Apply due range. Blank
boundaries are unbounded; with both blank, undated tasks also match. Otherwise only
dated tasks in the range match. The range intersects both selectors, survives edits
and selector changes, and remains usable in archived projects. Invalid calendar dates
or reversed boundaries show an alert without replacing the applied range. Reopening
from the project list resets the range to empty; filters never alter saved task data.
Each task row has Destination project and Move task controls. Destinations are other
active projects in project creation order, using their current names. A first arrival
appends after all positions established in the destination. Returning tasks reuse their
remembered position in each project, even when several return in a different order.
New tasks append after reserved positions of tasks currently away. Movement preserves
title, completion, priority and due date, and keeps the source page's filters and due range. Summaries reflect
current ownership. Moves and task ordering persist across restarts. Archived projects
cannot send or receive tasks; controls are disabled when no destination is available.
Open an active project to create tasks or toggle completion. `GET /health` returns
`{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration tests use temporary databases and verify project/task validation,
creation order, escaped names and titles, navigation, project ownership, task
filters and completion, archive/restore, summaries, project and task renaming and identity preservation, database migration, health,
task priorities, project-default migration and inheritance, edits, isolation, combined filters and selection preservation,
due-date migration, calendar validation, clearing and isolation, archive restrictions,
inclusive due ranges, combined membership, invalid-range preservation, edit re-evaluation,
task moves, destination eligibility, persistent per-project return ordering, legacy-order migration, move summaries,
source-filter preservation, archive restrictions, and persistence across server restarts.
Temporary files are removed afterward.
