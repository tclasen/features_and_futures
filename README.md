# Workboard

Requires Node.js 22.22.1. There are no application dependencies to install.

```sh
npm start
```

The server binds to `0.0.0.0` at `PORT` (default `8080`). Set `DB_PATH` to the
SQLite file to use (default `data/workboard.sqlite`). Its parent directory is
created automatically. Keep this file to preserve projects, tasks, and completion
state, priorities, and archive status between restarts. Existing databases are migrated
automatically without changing project IDs or tasks.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm test
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. Project creation and
navigation use ordinary browser forms. Names are trimmed before persistence;
blank names return a visible validation alert without creating a project.
Each project has its own tasks. Titles are trimmed and blank titles show a
validation alert. Checkboxes save completion immediately; the task filter shows
All (the default), Open, or Completed tasks in creation order. Direct project
URLs remain usable after reloads and restarts.

The project filter defaults to Active and also offers Archived. Archive project
moves a project to Archived; Restore project returns it to Active, retaining its
tasks and completion state. Archived project pages allow viewing and filtering
tasks but disable creation and completion changes. The server also rejects task
changes on archived projects. Each project row shows completed/total task counts
across all its tasks.

Active project pages offer New project name and Rename project. Renaming trims
the name and preserves the project URL, creation order, tasks, and completion
summary. Blank names show a validation alert without changing the saved name.
Archived projects disable renaming, and the server rejects rename requests until
the project is restored. Renamed project names persist between restarts.

Each task row offers New task title and Rename task. Renaming trims the title
and updates the completion checkbox label while preserving ownership, creation
order, completion, filter membership, and project counts. Blank titles show an
alert without changing the saved task. Archived projects disable task renaming;
the server rejects changes until restoration. Task titles persist between restarts.

Each task row has a Task priority selector with Low, Normal, and High options.
Existing tasks default to Normal when migrated. Changes save immediately and persist
between restarts, independently of completion and renaming. Archived projects
disable priority changes in the browser and on the server; restoration preserves
the saved priorities.

Project pages also offer Priority filter with All (the default), Low, Normal,
and High options. Tasks must match both Task filter and Priority filter and
remain in creation order. Changing either filter or editing a task preserves
both selected filters; edits immediately update the matching rows. Filters do
not change saved tasks or completion summaries and remain usable when archived.
Opening a project from the project list starts with both filters set to All.

Each project has a Default task priority selector with Low, Normal, and High
options, initially Normal. Changes save immediately and apply only to tasks
created afterward in that project. Existing tasks and both selected filters
remain unchanged. Defaults persist through reloads, restarts, renaming, archival,
and restoration. Archived projects display the saved default but disable changes;
the server also rejects edits until restoration.

Each task has an optional Task due date textbox and Save due date button. Blank
values clear the date. Nonempty values are trimmed and must be real Gregorian
calendar dates in YYYY-MM-DD format, with years 0001 through 9999. Dates are
stored as calendar-day strings without timezone conversion. Invalid dates show
an alert and keep the saved date. Dates persist across restarts and renaming;
saving them preserves both filters and all other task data. Existing tasks
start without dates. Archived projects disable date editing in the browser and
on the server; restoration preserves dates and enables editing.

Project pages have Due from and Due through textboxes and Apply due range.
Boundaries use the same Gregorian date validation as task dates, are trimmed,
and match inclusively. Either boundary can be blank; with both blank, undated
tasks also match. The applied range intersects completion and priority filters
without changing saved tasks or all-task summaries. Invalid ranges show an alert
and preserve the previously applied range. Edits retain all selected filters and
immediately update matching rows. Range controls remain usable when archived.
The applied range is carried in the page URL and forms, not stored in SQLite;
opening a project from the list starts with empty boundaries.
