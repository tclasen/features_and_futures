# Workboard

Requires Node.js 22.22.1. No dependencies to install.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`. `GET /health` returns `{"status":"ok"}`.
Projects, archive state, and tasks are saved in SQLite and retained across restarts.
Use the Project filter to view Active or Archived projects. Archive or restore
projects from their rows; summaries show completed live tasks out of all live tasks.
Active project pages support renaming with trimmed, nonblank names while retaining
project identity, order, and tasks. Archived project pages allow viewing and
filtering but prevent task changes and renaming.
Existing databases are migrated automatically without losing projects or tasks.
Each task has a multiline Task notes field and Save notes button. Notes preserve
whitespace, Unicode and literal markup as plain text, persist across restarts,
and travel with moved tasks. They do not participate in search or change filters
or other task data. Existing and new tasks start with empty notes. Archived
projects show notes with editing disabled; restoration enables editing again.
Live tasks provide Delete task; deleted tasks provide Restore task. Deletion
preserves all fields and remembered positions but excludes the task from live
filters and completion summaries. The Deleted task filter intersects priority,
due range and title search. Deleted rows are read-only until restored; restoring
returns them to their reserved position without resetting filters. Archived
projects disable deletion and restoration. Existing tasks migrate as live, and
deletion persists across restarts.
Every project page offers Download project, including archived projects. It downloads
UTF-8 `workboard-project.json` with format `workboard-project`, version 1, project
state, and all live/deleted tasks in stored order, independent of visible filters.
Task notes use LF line endings in the export; downloading changes no stored data
or selected controls.
Open a project to create tasks, toggle completion, and filter All, Open,
Completed, or Deleted tasks. Each task row supports renaming with a trimmed, nonblank title;
renaming preserves ownership, creation order, and completion. Archived projects
disable task rename controls, and restoration enables them again. Each task has a
Task priority selector with Low, Normal, and High choices, defaulting to Normal.
Priorities persist independently, including through renaming and archive/restore;
archived projects disable priority edits. Existing tasks migrate to Normal.
The Priority filter offers All, Low, Normal, and High and combines with the Task
filter. Both start at All when opening a project from the list. Changes preserve
the other selection; task edits immediately re-evaluate matching rows without
resetting either filter. Both filters remain usable in archived projects, and
project summaries always count all tasks.
Each project has a Default task priority selector (Low, Normal, High), initially
Normal. Changes persist independently per project and apply only to subsequently
created tasks, leaving existing tasks, summaries, and selected filters unchanged.
The default survives renaming, restart, archival, and restoration; archived
projects display it in a disabled selector.
Each task has an optional Task due date textbox and Save due date button. Dates
are trimmed and validated as real Gregorian YYYY-MM-DD calendar days (years
0001–9999), without timezone conversion. Blank values clear the saved date;
invalid values show an alert without changing data. Dates persist independently
through renaming and restart. Archived projects disable date editing; restoration
preserves dates and enables editing again.
Due from and Due through apply an inclusive due-date range intersecting both
combobox filters. Blank boundaries are unbounded; any nonblank boundary excludes
undated tasks. Invalid ranges show an alert and retain the last applied range.
All edits retain the applied range and filter selections, while date, priority,
and completion edits immediately re-evaluate membership. Archived projects allow
range filtering. Opening a project from the list starts with empty boundaries.
Each task row provides Destination project and Move task controls. Destinations
are other active projects in creation order. First-time arrivals append after all
positions already established in the destination. Returning tasks recover their
remembered position in that project, even when returned in a different order.
Moves preserve current identity, title, completion, priority, and due date. Source
filters stay selected and both summaries update. Archived projects cannot send or
receive tasks; with no eligible destination the move controls are disabled.
Task ownership and per-project remembered positions persist across restarts,
including repeated moves, project renaming, archival, and restoration. Existing
task order is retained during migration; new tasks follow reserved positions even
when their previous occupants are elsewhere.
Project search and Search projects apply a trimmed substring query intersecting
Active/Archived filtering. Task search and Search tasks intersect completion,
priority, and due-range filters. Searches ignore ASCII letter case and collapse
runs of ASCII spaces and horizontal tabs to one space for matching only. Stored
names and titles retain their original whitespace and case. Applied queries survive filtering and edits, with immediate
membership updates; summaries still count all tasks. Search remains available in
archived projects. Opening the list via Projects or opening a project from the
list starts with an empty query.
Native HTML forms handle creation and navigation; small inline browser event
handlers submit completion, priority, default priority, and filter changes.

## Verify

```sh
npm test
```

Tests use a temporary database outside the repository and verify validation,
creation order, escaping, navigation, health, task filtering, project isolation,
task/completion persistence, schema migration, archive/restore, read-only archived
projects, completion summaries, and project/task renaming with preserved identity,
ownership, order, completion, and filter membership across restarts. Priority tests
also cover existing-task migration, defaults, independent updates, validation,
archive protection, restoration, and persistence across process restarts.
Combined-filter tests cover every completion/priority combination, creation order,
selection retention through edits and validation, live membership changes,
unchanged summaries, archived filtering, and saved data across restarts.
Project-default tests cover migration, independent defaults, inheritance only by
new tasks, unchanged filters and summaries, validation, renaming, archived write
protection, restoration, and process-restart persistence.
Due-date tests cover migration, blank defaults, strict date validation including
leap years and year boundaries, clearing, task isolation, unchanged summaries and
filters, renaming, archive protection, restoration, and restart persistence.
Due-range tests cover inclusive and one-sided boundaries, undated tasks, combined
filters, rendered form state, invalid-range preservation, membership changes on
edits, selection retention, archived filtering, restoration, and restart.
Move tests cover ordering migration, eligible destination labels, disabled controls,
invalid and archived moves, source filter retention, summaries, repeated moves,
new-task ordering, preserved task data, and restart persistence. Return-order tests
cover reverse returns, empty projects with reserved positions, first arrivals,
project renaming, archive/restore, and current edited values across restarts.
Search tests cover ASCII-only case matching, space/tab run normalization without
rewriting stored text, significant non-ASCII whitespace,
combined filters, rendered form state, query retention through edits and invalid
ranges, movement/return order, archived search, initial empty queries, unchanged
summaries, and restart persistence.
