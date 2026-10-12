# Workboard

Requires Node.js 22.22.1. No dependencies or installation step are needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH`
defaults to `./data/workboard.sqlite`. Parent database directories are created
automatically. Keep the database file to preserve projects, tasks, and completion
state and archive status across restarts. Existing databases are upgraded
automatically, with existing projects remaining active. `GET /health` returns `{"status":"ok"}`.

Open a project to create tasks, check or uncheck their completion, and filter
the list by All, Open, or Completed. Lists display items in creation order.
The Priority filter offers All, Low, Normal, and High, initially All. Both filters
apply together and keep their selections when tasks are renamed or their priority
or completion changes. Saved edits immediately update the matching rows. Filters
remain usable in archived projects and never change saved data or completion counts.

The project list defaults to Active. Archive a project to move it to Archived,
then restore it from that list when needed. Archived projects allow viewing and
filtering tasks but disable task creation and completion changes. Each project
row shows completed/total counts across all of its tasks. The API also rejects
task writes to archived projects with HTTP 409.

Use New project name and Rename project on an active project page to rename it.
Names are trimmed and must be nonblank. Renaming preserves the URL, list order,
tasks, and completion counts, and the new name persists across restarts. Archived
projects disable renaming until restored. `PATCH /api/projects/<id>` accepts
either `{ "name": "New name" }` or `{ "archived": true }` in separate requests;
renaming an archived project returns HTTP 409.

Each task row provides New task title and Rename task. Titles are trimmed and
must be nonblank. Renaming preserves task identity, ownership, creation order,
completion state, and completion counts. Archived projects disable task renaming
until restored. `PATCH /api/projects/<project-id>/tasks/<task-id>` accepts either
`{ "title": "New title" }`, `{ "completed": true }`, `{ "priority": "High" }`,
or `{ "dueDate": "2024-02-29" }` in separate requests.
Renamed titles persist across restarts; archived task writes return HTTP 409.

Each task has a Task priority select with Low, Normal, and High options. Existing
tasks default to Normal on migration. New tasks inherit their project's saved
default. Priorities persist across restarts independently
of titles, completion, and ownership. Archived projects disable priority changes;
restoring a project preserves its saved priorities and enables editing again.

Default task priority on each project page offers Low, Normal, and High. Existing
and new projects initially use Normal. Changes apply only to subsequently created
tasks in that project, preserving existing tasks, both filters, and summaries.
Defaults persist through renaming, restarts, archive, and restoration. Archived
projects show the saved default with editing disabled. The project API exposes
`defaultPriority`; `PATCH /api/projects/<id>` accepts `{ "defaultPriority": "High" }`
separately from rename or archive requests. Invalid priorities return HTTP 400;
default edits on archived projects return HTTP 409.

Each task row has a Task due date textbox and Save due date button. Dates are
optional: empty or whitespace-only input clears the date. Other input is trimmed
and must be a real Gregorian day in YYYY-MM-DD format, with a year from 0001
through 9999. Dates are stored as calendar days without timezone conversion.
Invalid input shows an alert and preserves the saved date and other task data.
New tasks and migrated tasks have no due date. Saved dates persist through
renaming, restart, archive, and restoration, independently of other tasks.
Saving dates preserves both filters and completion counts. Archived projects
disable date editing, and the API rejects it with HTTP 409. The task API exposes
`dueDate` as a string, using `""` for no date; invalid values return HTTP 400.

Due from and Due through accept optional calendar dates using the same rules.
Apply due range intersects inclusive boundaries with the completion and priority
filters, retaining creation order. A blank boundary is unbounded; undated tasks
match only when both boundaries are blank. Invalid dates or a reversed range show
an alert and preserve the previous applied range. Editing a boundary takes effect
only after a successful application. Saved task edits immediately re-evaluate all
three filters, while renames, creation, and default-priority changes retain them.
Range filtering remains available in archived projects, never changes saved data
or summary counts, and resets to empty boundaries when reopening a project.

Each task row offers Destination project and Move task. Destinations are other
active projects in project creation order, using their current names. A first visit
appends the task after all positions established in the destination. Returning
to a previous project restores the task's remembered position relative to other
tasks, even when several tasks return in a different order. New tasks also follow
all established positions, including those reserved for tasks currently away.
Moving preserves its identity,
title, completion, priority, and optional due date. The source page stays open
with all selected filters and its applied due range unchanged. Both project
summaries reflect their current tasks. Moving is disabled in archived projects
or when no eligible destination exists; archived projects cannot receive tasks.
Moves and task order persist across restarts, and existing databases retain their
previous order during migration. Positions are remembered separately per project
and survive project renaming, archive, restoration, and restarts. Returning uses
the task's current fields, not older values. Databases from earlier versions
seed remembered positions from current ownership and order; past visits were not
stored and cannot be recovered. The task PATCH endpoint accepts
`{ "destinationProjectId": 2 }` separately from other edits. Invalid destinations
return HTTP 400, missing projects/tasks return HTTP 404, and archived sources or
destinations return HTTP 409.

Run the tests with `npm test`. Tests use temporary databases outside
the repository and clean up their server processes and files.

Project search and Search projects match a substring of project names, intersecting
the Active/Archived filter. Task search and Search tasks intersect completion,
priority, and the applied due range. Searches ignore ASCII letter case and trim
only query edges. For matching, runs of ASCII spaces and horizontal tabs in both
queries and saved names/titles are treated as one space. Stored and displayed
names/titles retain their original internal whitespace and case. Blank queries match
everything allowed by the other filters. Queries apply on submission, remain
applied during filtering and edits, and reset when opening their page. Archived
projects still allow searching. Search never writes saved data or changes the
all-task completion summaries.

Each task row has a multiline Task notes textarea and Save notes button. Notes
are optional plain text and preserve spaces, line breaks, Unicode, and literal
markup exactly as entered. Empty text clears them. Existing and new tasks start
with empty notes. Notes persist through restarts, moves, and return-position
restoration without changing other task fields, ordering, filters, or summaries.
Search continues to match only names and titles. Archived projects show saved
notes with editing disabled until restored. The task PATCH endpoint accepts
`{ "notes": "Text\nMore text" }` separately from other edits; non-string notes
return HTTP 400, and archived task writes return HTTP 409.

Task filter offers All, Open, Completed, and Deleted. The first three show only
live tasks; Deleted shows only deleted tasks and intersects priority, date range,
and title search. Delete task reserves all saved fields and per-project positions
while removing the task from live lists and completion summaries. Restore task
returns it to its reserved position with its current saved fields. Deleted tasks
show disabled editing and move controls; archived projects also disable deletion
and restoration while retaining reading filters. Earlier tasks migrate as live.
The task PATCH endpoint accepts `{ "deleted": true }` or `{ "deleted": false }`
separately from other edits. Deleted task edits return HTTP 409 until restored.

Download project is available on every project page, including archived projects.
It downloads UTF-8 `workboard-project.json` with format `workboard-project`, version
1, and the current project name, archive state, default priority, and all owned
tasks (live and deleted) in saved order. Each task includes its title, completion,
priority, due date, notes, and deletion state. Notes use LF line endings in the
export; stored text remains unchanged. Filters and searches do not limit the
download or change on export. `GET /api/projects/<id>/export` returns the JSON as
an attachment; a missing project returns HTTP 404. Database IDs and remembered
return positions are internal and are excluded from this portable document.

The home page provides Project JSON, Imported project name, and Import project.
Paste a version 1 portable document and enter a nonblank name for the new copy.
Import validates the complete document before a single transaction creates fresh
project/task identities and initial remembered positions. It never merges with
existing data. Required fields must have their specified types, dates must be
canonical valid calendar dates, and titles remain exact nonblank strings. Notes
normalize line breaks to LF while preserving all other text. Additional properties
cannot set internal identities. Archived state, default priority, deletion and
all task fields and order are retained. Errors retain both submitted inputs and
leave all saved data unchanged. `POST /api/projects/import` accepts
`{ "name": "Copy name", "json": "<portable JSON text>" }` and returns the new
project with HTTP 201, or HTTP 400 with `Invalid project JSON` or
`Project name is required`.
