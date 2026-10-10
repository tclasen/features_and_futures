# Workboard

A project and task management application using Node.js 22.22.1, built-in HTTP and SQLite, and browser JavaScript. No dependencies or installation step are required.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

`PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The server binds to `0.0.0.0` and creates the database's parent directory if needed. Keep the configured SQLite file to retain projects, tasks, completion states, task priorities, project priority defaults, and archive states between restarts. Existing databases are migrated automatically without changing project or task IDs. `GET /health` returns `{"status":"ok"}`.

The project list initially shows Active projects; its Project filter also shows Archived projects. Each row includes a completion summary counting all of the project's tasks. Archive and restore preserve tasks and completion state.

Active project pages also support renaming with trimmed, nonblank names. Renaming preserves the project URL, creation order, tasks, and completion summary. Archived projects disable renaming; restoring enables it again. The API accepts `PATCH /api/projects/<id>` with `{ "name": "New name" }`; rename and archive changes must use separate requests.

Each project page supports task creation, completion checkboxes, task renaming, and All/Open/Completed filters. Tasks remain scoped to their owning project; the Task filter (All/Open/Completed) and Priority filter (All/Low/Normal/High) both initially select All on each page load. They combine to show matching tasks in creation order. Changing either filter or editing a task preserves both selected values; completion and priority edits immediately re-evaluate the rows. Filters never change saved task data or the all-task completion summary, and both remain usable when archived. Renaming trims and validates the title without changing task order, ownership, completion, or summaries, and updates the checkbox label. The API accepts `PATCH /api/projects/<project-id>/tasks/<task-id>` with `{ "title": "New title" }`; rename and completion changes must use separate requests. Each task also has a Task priority selector with Low, Normal, and High options. Existing tasks retain their priorities. Each project has a Default task priority selector (Low/Normal/High), initially Normal for existing and new projects. Changes persist independently per project and affect only subsequently created tasks, leaving existing tasks, both filter selections, and summaries unchanged. Defaults survive renaming, archival, restoration, and restarts. Archived projects display the saved default but disable editing; the server rejects these writes as well. The project PATCH endpoint accepts `{ "default_priority": "High" }`; default, rename, and archive changes use separate requests. Priority changes persist independently without affecting titles, completion, ownership, order, or summaries. The task PATCH endpoint accepts `{ "priority": "High" }`; title, completion, and priority changes use separate requests. Archived project pages retain task filtering but disable creation, completion updates, task rename controls, and priority selectors; the server also rejects these writes.

## Verify

```sh
npm test
```

Tests start real server processes with a temporary SQLite database and verify health, input validation, creation order, project lookup, task ownership, completion updates, page/asset routes, archive/restore, project and task renaming and archived rename protection, completion summaries, independent task priorities and their validation/archive protection, project default inheritance and independence, legacy database migration, and persistence after process restarts. Temporary files are removed afterward. Dependency-free browser-entry-point tests additionally exercise all combined filter values, selection retention, task-edit re-filtering, renamed checkbox labels, default-setting saves and failure recovery, and archived filtering/edit controls using a minimal DOM adapter.
