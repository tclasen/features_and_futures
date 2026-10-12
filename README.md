# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`) and SQLite at
`DB_PATH` (default `./data/workboard.sqlite`). Parent directories are created
on startup. Keep that database file to preserve projects, archive states, tasks,
completion states, task priorities, due dates, notes, deletion states, and project priority defaults across restarts. Existing databases are migrated automatically.

Example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

`GET /health` returns `{"status":"ok"}`. The UI uses HTML forms with a small
browser script to submit completion changes, priority changes, and filters automatically.
Project names and task titles are trimmed and HTML-escaped. Projects and tasks
are ordered by creation, with first-time arrivals appended and returning tasks restored
to their remembered project-local positions. Each project's tasks can be
filtered by All (the default), Open, Completed, or Deleted, combined with a Priority filter
of All (the default), Low, Normal, or High. Both filters must match; changing a
filter or editing a task preserves the other selection and creation order.
Edits immediately re-evaluate visible tasks without changing summary counts
except when completion, deletion, restoration, or ownership changes. Both filters remain usable while archived.
The project list defaults to
Active and can show Archived projects instead. Archive and restore preserve all
tasks; archived pages allow filtering but reject task changes and renaming. Each
project row shows completed/total counts across all its live tasks. Active project pages
allow renaming with a trimmed, nonblank name. Renaming preserves the project URL,
creation order, tasks, and completion states; names persist across restarts.
Each task row also supports renaming to a trimmed, nonblank title. Task renaming
preserves ownership, creation order, completion state, filter membership, and
project summaries. The completion checkbox label follows the saved title.
Archived projects disable task rename controls and reject rename requests;
restoration enables them again. Each task has an independent Low, Normal, or High
priority. Migrated tasks retain Normal; new tasks inherit their project's saved
Default task priority (initially Normal). Changing a project default affects only
future tasks, preserves both selected filters, and never changes existing tasks
or summaries. Defaults are independent per project and survive renaming, restarts,
archive, and restore. Archived pages display the saved default but disable changes.
Priority changes
preserve all other task data and summaries, persist across restarts, and are
blocked while the project is archived.

Each task has an optional Task due date textbox and Save due date button. Saving
trims whitespace; an empty value clears the date. Nonempty dates must be real
Gregorian calendar days in `YYYY-MM-DD` format, with years `0001` through `9999`.
Dates are stored as calendar-day strings without timezone conversion. Invalid
values display an alert and leave saved data unchanged. Date changes preserve
both filters and all other task data; renaming preserves dates. Archived projects
disable date editing, and restoration preserves saved dates.

Each task has a multiline Task notes textarea and Save notes button. Notes are
plain text, saved without trimming, including whitespace, Unicode and literal markup;
empty text clears them. Existing and new tasks start with empty notes. Notes persist
across restarts, moves and return-position restoration without changing other task
data. Saving preserves all applied filters and search; notes do not add search
matches. Archived projects show notes with editing disabled and reject saves;
restoration enables editing again. Forms have a 64 KiB encoded request-body limit.

Live rows offer Delete task; deleted rows offer Restore task. All, Open and Completed
show only live tasks. Deleted shows only deleted tasks, intersecting priority, due
range and title search. Deletion excludes the task from summaries but retains every
field, ownership and remembered position. Restoration returns it to its reserved
position, even before tasks created while it was deleted. Both actions retain all
applied filters. Deleted tasks show saved fields with all editing and movement
controls disabled; the server also rejects those edits. Archived projects disable
both deletion and restoration but keep reading filters usable. Deletion persists
across restarts; upgrades initialize all existing tasks as live.

Project pages also offer Due from and Due through textboxes with Apply due range.
These use the same calendar-date rules and inclusive boundaries. Blank boundaries
are unbounded; undated tasks match only when both boundaries are blank. The applied
range intersects completion and priority filters, and all three filters survive
edits and re-evaluate task membership immediately. Invalid ranges show an alert
without changing the applied range. Ranges do not change task data or summary
counts, remain usable while archived, and reset when opening from the project list.

Each task row offers Destination project and Move task. Destinations are other
active projects in project creation order, using their current names. Moving
preserves the task's identity, title, completion, priority and due date. First-time
arrivals append after all positions already established in the destination, including
positions reserved for absent tasks. Returning tasks reuse their remembered position;
returning several in a different order restores their original relative order.
Positions are saved independently for each project and survive renaming, archival,
and restarts. Existing databases retain their current task order on migration.
Position and ownership changes are committed atomically. The source page retains all filters;
both project summaries reflect the new ownership. Ordering and ownership survive
restarts. Archived projects cannot be sources or destinations. Move controls are
disabled while archived or when no eligible destination exists.

Project search and Task search apply trimmed substring queries, ignoring only ASCII
letter case and collapsing each run of ASCII spaces and horizontal tabs to one space
in both names/titles and queries for matching only. Stored and displayed names/titles
retain their original whitespace and case. Search intersects the other filters,
retains creation/remembered order, and never changes data or live-task summaries.
Applied queries survive filter changes and edits, including task moves; archived
pages still allow search. Opening from the project list resets task search, and
returning with Projects resets project search. Queries are carried in forms and URLs,
not stored in SQLite.

Every project page offers Download project, including archived and empty projects.
`GET /projects/<id>/download` downloads UTF-8 `workboard-project.json` with
`format: "workboard-project"`, `version: 1`, and the project's current name,
archive state, default priority and all live/deleted tasks in stored relative order.
Task records contain title, completion, priority, due date, notes and deletion state;
IDs and remembered positions are not part of the portable document. Export ignores
all view filters and searches, makes no data changes, and converts notes line endings
to LF only in the downloaded representation.

Run automated HTTP and persistence tests:

```sh
npm test
```
