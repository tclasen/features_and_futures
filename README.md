# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). SQLite data is
stored at `DB_PATH` (default `data/workboard.sqlite`); keep this file to
preserve projects, archive state, tasks and completion state across restarts. Parent directories
are created automatically.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm test
npm run check
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. Projects are created
through the form at `/` and opened at `/projects/<id>`.
Each project page supports creating tasks, toggling completion and filtering by
All, Open or Completed. Task filters use the page's `filter` query parameter;
opening a project without it defaults to All.

The project list defaults to Active; select Archived to open or restore archived
projects. Archiving preserves all tasks but disables task creation and completion
changes until restoration. Each project row summarizes completed tasks out of all
its tasks, independently of the task filter. Existing SQLite files are upgraded
automatically, with existing projects initially active.

Active project pages also support renaming. Names are trimmed and cannot be blank.
Renaming preserves the project's URL, creation order, tasks and completion summary.
Archived projects cannot be renamed until restored. Renamed projects persist in
the same SQLite file across restarts.

Each task row supports renaming in active projects. Titles are trimmed and cannot
be blank. Renaming preserves task identity, ownership, creation order, completion
state and the selected filter. Archived projects disable task rename controls and
reject rename requests until restored. Renamed titles persist across restarts.

Each task has a Task priority selector with Low, Normal and High options. Existing
tasks default to Normal. New tasks inherit their project's saved default. Priority
changes save immediately and preserve the task's title, completion, ownership,
order and current filter. Renaming also
preserves priority. Archived projects disable priority changes until restored.
Priorities persist in SQLite across restarts; existing databases are upgraded
automatically.

Project pages also provide a Priority filter with All, Low, Normal and High options.
It combines with Task filter: only tasks matching both selections appear, in
creation order. Both selections remain unchanged during task renames, priority
edits and completion changes. Filter state lives in the page URL (`filter` and
`priorityFilter`); opening from the project list starts with both set to All.
Filtering remains available while archived and does not change saved tasks or
completion summaries.

Each project page provides a Default task priority selector with Low, Normal and
High options, initially Normal. Changes save immediately for that project and
apply only to tasks created afterward. Existing tasks and both selected filters
remain unchanged. Defaults persist across reloads, restarts and project renaming.
Archived projects display the saved default but disable changes until restored.
Existing SQLite databases are upgraded with Normal defaults without altering tasks.
