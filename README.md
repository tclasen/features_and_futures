# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`; parent directories are
created automatically. Keep the database file to preserve projects, tasks, and
completion and archive state across restarts. Existing databases are migrated
without losing projects or tasks.

Open a project to create tasks, toggle their completion, and filter by All, Open,
or Completed. Each project has its own tasks; filtering does not change saved data.
The project list defaults to Active; switch to Archived to open or restore archived
projects. Archived projects retain their tasks but cannot create tasks or change
completion until restored. Project rows summarize completed tasks out of all tasks.
Active project pages also let you rename a project. Names are trimmed and must not
be blank; renaming preserves the URL, creation order, tasks, and summary. Archived
projects cannot be renamed until restored. Renamed names persist across restarts.
Each task row also lets you rename its title. Titles are trimmed and must not be
blank; renaming preserves task ownership, creation order, completion, filter
membership, and project summaries. The completion checkbox label follows the new
title. Archived projects disable task renaming until restored. Task titles persist
across restarts.
Each task has a Task priority selector with Low, Normal, and High options. Existing
tasks default to Normal when migrated; new tasks inherit their project's saved default. Priority changes persist independently without
changing completion, ownership, order, or summaries, and renaming preserves priority.
Archived projects disable priority edits until restored.
Project pages also have a Priority filter (All, Low, Normal, High), initially All.
It combines with the completion filter and keeps matching tasks in creation order.
Changing a task's completion or priority immediately reapplies both filters;
renaming and other task edits retain both selections. Filtering never changes
saved data or completion summaries. Both filters remain usable when archived.
Each project also has a Default task priority selector (Low, Normal, High), initially
Normal. Changes affect only subsequent new tasks in that project, never existing
tasks or either filter selection. Defaults persist through reloads, restarts,
renaming, archival, and restoration. Archived projects disable default edits until
restored.

Health check: `GET /health` returns `{"status":"ok"}`.

Run automated UI-control, HTTP, and persistence tests with `npm test`. Server tests use a temporary
SQLite database and verify validation, creation order, project lookup, page/asset
routes, task ownership, completion updates, archive/restore restrictions, summaries,
project and task rename validation and identity preservation, independent task priorities,
priority validation and archive restrictions, combined priority/completion filtering,
filter retention and immediate row updates after edits, independent project defaults,
new-task inheritance, default validation and archive protection, legacy database migration, and
persistence through process restarts.
