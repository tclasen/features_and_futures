# Workboard

Requires Node.js 22.22.1. No application dependencies or installation step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port 8080 and database file `data/workboard.sqlite`. The server binds to `0.0.0.0`; database parent directories are created automatically. Keep the database file to preserve projects, their tasks, and completion state between restarts. Existing project databases are upgraded automatically when the server starts.

Open a project to create tasks and toggle their completion checkboxes. The Task filter offers All (the default), Open, and Completed; tasks remain in creation order and belong only to their project.

Each project page also has a Priority filter offering All (the default), Low, Normal, and High. Tasks must match both task filters and remain in creation order. Changing a filter or editing a task preserves both selections; saved completion or priority edits immediately refresh matching rows. Both filters work on archived projects and never change saved tasks or completion summaries.

The Project filter defaults to Active. Archive projects from their rows, or choose Archived to open or restore them. Archived project pages retain task filtering but cannot create tasks or change completion. Every project row shows completed/total task counts, independent of task filters. Archive state and all tasks survive restarts.

Active project pages also offer New project name and Rename project. Names are trimmed and cannot be blank. Renaming preserves the project's URL, list position, tasks, and summary, and survives restarts. Archived projects cannot be renamed until restored.

Each task row offers New task title and Rename task. Titles are trimmed and cannot be blank. Renaming preserves ownership, creation order, completion state, filter membership, and project summaries. Task titles persist across restarts. Archived projects disable task renaming until restored.

Each task has a Task priority selector with Low, Normal, and High options. Existing and new tasks default to Normal. Priority changes affect only that task and persist across restarts, including after renaming, archiving, and restoring. Archived projects disable priority edits until restored.

`GET /health` returns `{"status":"ok"}`.

Run tests with `npm test`. Filter tests cover all completion/priority combinations, ordering, non-mutation, and membership after priority, completion, and title edits. Tests use an isolated temporary database and verify schema migration, project/task validation, rename identity and data preservation, ordering, project isolation, completion summaries, priority defaults and migration, independent priority edits and validation, archive write protection, restoration, page serving, and persistence across process restarts.
