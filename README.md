# Workboard

Tasks 001–010 provide project creation, renaming, archive/restore, completion summaries,
and project pages with task creation, completion checkboxes, and
All/Open/Completed filters. Archived projects retain their tasks and allow
filtering, while task creation and completion changes are disabled.
Active projects can be renamed with a trimmed, nonblank name, preserving their
URL, creation order, tasks, and summary. Archived rename controls are disabled.
Tasks can also be renamed and assigned Low, Normal, or High priority, defaulting
to Normal. These edits preserve ownership, creation order, and completion state.
Archived projects disable task renaming and priority controls as well.
Project pages combine the All/Open/Completed task filter with an
All/Low/Normal/High priority filter. Both start at All and retain their selections
when tasks are edited, immediately updating the matching rows in creation order.
Each project saves a default priority for subsequent new tasks without changing
existing tasks. Each task also has an optional due date: save a real Gregorian
date in YYYY-MM-DD format (years 0001–9999), or save a blank value to clear it.
Invalid dates display an alert and preserve the saved date. Archived projects
disable default-priority and due-date editing while retaining their saved values.
Due from and Due through apply an inclusive date range alongside both task filters.
Either boundary can be blank; both blank includes undated tasks, while a bounded
range excludes them. Invalid dates or reversed ranges show an alert and retain
the last applied range. Filters remain usable in archived projects and reset
when reopening a project; editing tasks re-evaluates the applied filters.
Uses Node.js 22.22.1,
JavaScript ES modules, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript.
No installation or external dependencies are needed.

Start:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Reuse the database path
across restarts to retain project names, archive state, default priorities, task
titles, priorities, completion state, and due dates.
Existing databases are migrated automatically; existing tasks begin with no due date.
`GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
```

Tests start isolated server processes and verify health, validation, trimming,
creation order, project routes, project ownership, completion updates, and
archive/restore, completion summaries, schema migration, and projects and tasks
surviving a process restart. Rename checks cover validation, identity and task
preservation, archived rejection, restoration, and persistence across restarts.
Priority checks cover migration of existing tasks, defaults, independent edits,
validation, unchanged summaries, archive/restore, and restart persistence.
Temporary test databases are removed afterward.
The browser script is also checked with a dependency-free DOM harness for
accessible labels, validation, filter behavior, completion changes, project
archive/restore, renaming, priority selection and error recovery, and archived project controls.
Combined filter checks cover all option pairs, preserved selections during edits,
creation order, unchanged summaries, and filtering archived and restored projects.
Default-priority checks cover inheritance and independent project defaults.
Due-date checks cover migration, leap years, date bounds, invalid input, clearing,
independent task values, preserved filters and summaries, archive/restore, and
restart persistence.
Due-range checks cover inclusive and open boundaries, undated tasks, all three
filters together, invalid applications, edit-driven membership changes, retained
filters during creation and renaming, archived controls, and reopening resets.
