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
projects from their rows; summaries show completed tasks out of all tasks.
Active project pages support renaming with trimmed, nonblank names while retaining
project identity, order, and tasks. Archived project pages allow viewing and
filtering but prevent task changes and renaming.
Existing databases are migrated automatically without losing projects or tasks.
Open a project to create tasks, toggle completion, and filter All, Open, or
Completed tasks. Each task row supports renaming with a trimmed, nonblank title;
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
