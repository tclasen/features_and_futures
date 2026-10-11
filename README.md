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
and High. Tasks must match both filters and appear in creation order. Changing
either filter preserves the other selection; task edits immediately update the
matching rows and retain both selections. Opening a project from the list starts
with both filters set to All. Filters remain usable in archived projects and do
not change saved data or completion summaries. Tasks belong only to the project
where they were created.

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
and validation, and persistence after server
restarts.
