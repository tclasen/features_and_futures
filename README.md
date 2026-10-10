# Workboard

A dependency-free project board using Node.js 22.22.1, built-in HTTP and SQLite, and server-rendered browser pages.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the SQLite file to retain projects, archive state, tasks, completion state, and task priorities between restarts. Existing databases are migrated automatically.

`GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Project pages support task creation, completion checkboxes, and combined All/Open/Completed and All/Low/Normal/High priority filtering. Both filters retain their selections through edits, immediately re-evaluate matching rows, and remain usable in archived projects. Opening a project from the list starts both filters at All. Tasks belong only to their project. The project list supports Active/Archived filtering, archive/restore controls, and completion summaries. Active project pages also support renaming with trimmed, nonblank names while preserving project URLs, creation order, tasks, and completion summaries. Each task row supports renaming with a trimmed, nonblank title while preserving ownership, creation order, completion state, and filter membership. Completion labels update to the new title. Each task has an independent Low/Normal/High priority selector, defaulting to Normal for both new and migrated tasks. Priorities persist across edits and restarts. Archived projects remain readable and filterable, but project/task renaming, task creation, completion changes, and priority edits are disabled and rejected by the server.

Tests use isolated temporary databases and verify project and task validation, creation order, HTML escaping, project navigation, task isolation, filtering, completion changes, health, archive/restore, completion summaries, legacy database migration, read-only archived tasks, project rename validation and identity preservation, task rename validation, ownership and completion preservation, archived task rename protection, task priority defaults and migration, independent priority changes, archived priority protection, combined completion/priority filter combinations, selection preservation and immediate re-filtering after edits, and persistence across server restarts.
