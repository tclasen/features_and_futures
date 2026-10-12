# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`) and SQLite at
`DB_PATH` (default `./data/workboard.sqlite`). Parent directories are created
on startup. Keep that database file to preserve projects, archive states, tasks,
completion states, task priorities, due dates, and project priority defaults across restarts. Existing databases are migrated automatically.

Example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

`GET /health` returns `{"status":"ok"}`. The UI uses HTML forms with a small
browser script to submit completion changes, priority changes, and filters automatically.
Project names and task titles are trimmed and HTML-escaped. Projects and tasks
are ordered by their persistent creation IDs. Each project's tasks can be
filtered by All (the default), Open, or Completed, combined with a Priority filter
of All (the default), Low, Normal, or High. Both filters must match; changing a
filter or editing a task preserves the other selection and creation order.
Edits immediately re-evaluate visible tasks without changing summary counts
except when completion itself changes. Both filters remain usable while archived.
The project list defaults to
Active and can show Archived projects instead. Archive and restore preserve all
tasks; archived pages allow filtering but reject task changes and renaming. Each
project row shows completed/total counts across all its tasks. Active project pages
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

Project pages also offer Due from and Due through textboxes with Apply due range.
These use the same calendar-date rules and inclusive boundaries. Blank boundaries
are unbounded; undated tasks match only when both boundaries are blank. The applied
range intersects completion and priority filters, and all three filters survive
edits and re-evaluate task membership immediately. Invalid ranges show an alert
without changing the applied range. Ranges do not change task data or summary
counts, remain usable while archived, and reset when opening from the project list.

Run automated HTTP and persistence tests:

```sh
npm test
```
