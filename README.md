# Workboard

A dependency-free project board using Node.js 22.22.1, built-in HTTP and SQLite, and server-rendered browser pages.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the SQLite file to retain projects, archive state, tasks, completion state, task priorities, project default task priorities, and task due dates between restarts. Existing databases are migrated automatically.

`GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Project pages support task creation, completion checkboxes, and combined All/Open/Completed and All/Low/Normal/High priority filtering. Both filters retain their selections through edits, immediately re-evaluate matching rows, and remain usable in archived projects. Opening a project from the list starts both filters at All. Tasks belong only to their project. The project list supports Active/Archived filtering, archive/restore controls, and completion summaries. Active project pages also support renaming with trimmed, nonblank names while preserving project URLs, creation order, tasks, and completion summaries. Each task row supports renaming with a trimmed, nonblank title while preserving ownership, creation order, completion state, and filter membership. Completion labels update to the new title. Each task has an independent Low/Normal/High priority selector, defaulting to Normal for migrated tasks. Each project has a saved Default task priority selector, initially Normal, that applies only to subsequently created tasks. Changing it preserves existing tasks and both filter selections; defaults remain independent across projects and survive renaming, archival, restoration, and restarts. Priorities persist across edits and restarts. Each task also has an optional Task due date textbox and Save due date button. Dates are trimmed and validated as real Gregorian YYYY-MM-DD calendar days (years 0001–9999), without timezone conversion. Blank values clear the date; invalid values show an alert and preserve the saved date. Saves preserve all other task data and both filters. Archived projects remain readable and filterable, but project/task renaming, task creation, completion changes, priority edits, default priority edits, and due-date edits are disabled and rejected by the server.

Tests use isolated temporary databases and verify project and task validation, creation order, HTML escaping, project navigation, task isolation, filtering, completion changes, health, archive/restore, completion summaries, legacy database migration, read-only archived tasks, project rename validation and identity preservation, task rename validation, ownership and completion preservation, archived task rename protection, task priority defaults and migration, independent priority changes, archived priority protection, combined completion/priority filter combinations, selection preservation and immediate re-filtering after edits, project default migration, independent defaults and inheritance by future tasks only, archived default protection, due-date migration, Gregorian date validation, clearing dates, independent date ownership, archived date protection, and persistence across server restarts.
