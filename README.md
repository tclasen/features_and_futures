# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step are needed.

```sh
npm start
```

The server binds to `0.0.0.0` using `PORT` (default `8080`). SQLite data is stored
at `DB_PATH` (default `data/workboard.sqlite`); keep this file to preserve projects and tasks
across restarts. Parent directories are created automatically.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm test
npm run check
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. The application uses
server-rendered HTML and standard browser forms. Project names are trimmed on
creation and escaped for display; project IDs provide stable URLs.
Each project owns its tasks. Task titles are trimmed and escaped for display.
Completion changes are saved immediately; the All, Open, and Completed filters
retain creation order. The selected filter is stored in the project page URL.

The project list initially shows Active projects; choose Archived to open or
restore archived projects. Archiving preserves tasks and completion state but
disables task creation and completion changes, including direct POST requests.
Each project summary counts all its tasks regardless of task filters. Existing
SQLite databases are migrated automatically, with existing projects initially
active. Archive state and task data persist across restarts.

Active projects can be renamed from their project page. Names are trimmed and
must not be blank. Renaming preserves the project ID, URL, creation order, tasks,
and completion summary. Archived projects cannot be renamed until restored;
this restriction also applies to direct POST requests. Renamed names persist
across restarts.

Each task in an active project can be renamed using its New task title field.
Titles are trimmed and must not be blank. Renaming preserves ownership,
creation order, completion state, filter membership, and completion summaries.
The displayed title and completion checkbox label update together. Archived
projects disable task renaming and reject direct rename requests until restored.
Renamed titles persist across restarts.

Each task has a Task priority selector with Low, Normal, and High options.
Existing tasks default to Normal during migration. Changes save immediately and persist
across restarts without changing task order, ownership, completion, or summaries.
Renaming preserves priority. Archived projects disable priority selectors and
reject direct priority changes; restoration preserves and enables them again.

Project pages also have a Priority filter with All, Low, Normal, and High options.
Tasks must match both the completion and priority filters, retaining creation
order. Both selections are carried in the page URL and through edits and
validation errors. Changes to completion or priority immediately re-evaluate
matching rows. Opening a project from the list starts both filters at All.
Filters remain usable while archived and never change saved tasks or summaries.

Each project has a Default task priority selector with Low, Normal, and High
options, initially Normal. Changes save immediately and apply only to tasks
created afterward in that project. Existing tasks and both selected filters stay
unchanged. Defaults persist through restarts, renaming, archival, and restoration.
Archived projects display their saved default in a disabled selector and reject
direct changes until restored.

Each task has a Task due date textbox and Save due date button. Dates are optional:
blank input clears the saved date. Nonempty values are trimmed and must be real
Gregorian dates in YYYY-MM-DD format with years 0001–9999. Invalid dates show an
alert and leave saved data unchanged. Calendar dates are stored as text without
timezone conversion. Existing and new tasks start with no due date. Dates persist
through restarts and renaming; saving preserves both filters and other task data.
Archived projects disable date editing and reject direct saves until restored.

Project pages provide Due from and Due through textboxes and an Apply due range
button. Boundaries use the same calendar validation as task due dates and are
inclusive. Either blank boundary is unbounded; with both blank, undated tasks
also match. Otherwise undated tasks are excluded. The range intersects the
completion and priority filters while preserving task order and all-task summaries.
Invalid applications display an alert and preserve the previously applied range
and visible rows. Applied boundaries travel in the page URL and hidden form
fields, separately from draft range inputs, so task edits, validation errors,
renaming, creation, default changes, and combobox changes retain the applied range.
Range controls remain available while archived. Reopening from the project list
uses the bare project URL and resets both boundaries to empty.
