# Workboard

Requires Node.js 22.22.1. No application dependencies or installation step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port 8080 and database file `data/workboard.sqlite`. The server binds to `0.0.0.0`; database parent directories are created automatically. Keep the database file to preserve projects, their tasks, and completion state between restarts. Existing project databases are upgraded automatically when the server starts.

Open a project to create tasks and toggle their completion checkboxes. The Task filter offers All (the default), Open, and Completed; tasks remain in creation order and belong only to their project.

The Project filter defaults to Active. Archive projects from their rows, or choose Archived to open or restore them. Archived project pages retain task filtering but cannot create tasks or change completion. Every project row shows completed/total task counts, independent of task filters. Archive state and all tasks survive restarts.

Active project pages also offer New project name and Rename project. Names are trimmed and cannot be blank. Renaming preserves the project's URL, list position, tasks, and summary, and survives restarts. Archived projects cannot be renamed until restored.

Each task row offers New task title and Rename task. Titles are trimmed and cannot be blank. Renaming preserves ownership, creation order, completion state, filter membership, and project summaries. Task titles persist across restarts. Archived projects disable task renaming until restored.

`GET /health` returns `{"status":"ok"}`.

Run integration tests with `npm test`. Tests use an isolated temporary database and verify schema migration, project/task validation, rename identity and data preservation, ordering, project isolation, completion summaries, archive write protection, restoration, page serving, and persistence across process restarts.
