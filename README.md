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

Each task has a Task priority selector with Low, Normal, and High options. Existing tasks default to Normal when upgrading from the pre-priority schema. New tasks inherit their project's saved default. Priority changes affect only that task and persist across restarts, including after renaming, archiving, and restoring. Archived projects disable priority edits until restored.

Each project page offers Default task priority with Low, Normal, and High options. New and upgraded projects start with Normal. Changing this default affects only subsequently created tasks, not existing tasks or either selected filter. Defaults are independent per project and persist through reloads, restarts, renaming, archival, and restoration. Archived projects display the saved default but disable changes.

Each task row offers Task due date and Save due date. Dates start empty; saving blank input clears them. Nonempty input is trimmed and must be a real Gregorian date in `YYYY-MM-DD` format with year 0001–9999. Invalid dates show an alert and leave the saved date unchanged. Dates are stored as calendar-day strings without timezone conversion, independently per task, and persist through renaming and restarts. Date edits preserve both filters and all other task data. Archived projects disable date editing until restored.

Project pages offer Due from, Due through, and Apply due range. Boundaries use the same calendar-date rules as task dates and are inclusive; blank boundaries are unbounded. An entirely blank range includes undated tasks, while any nonblank boundary excludes them. The applied range intersects completion and priority filters without changing either selection or saved data. Invalid dates or reversed boundaries show an alert and leave the previous range active. Task edits immediately refresh matching rows; other edits and task creation retain the range. Range controls work on archived projects. Reopening a project starts with empty boundaries.

`GET /health` returns `{"status":"ok"}`.

Run tests with `npm test`. Due-range tests cover boundary validation, inclusive and one-sided ranges, undated tasks, all filter intersections, invalid-application preservation, and membership after edits. Filter tests cover all completion/priority combinations, ordering, non-mutation, and membership after priority, completion, and title edits. Tests use an isolated temporary database and verify schema migration, project/task validation, rename identity and data preservation, ordering, project isolation, completion summaries, priority defaults and migration, independent priority edits and validation, project-default migration, validation, independent inheritance and non-retroactivity, archive write protection, restoration, page serving, due-date migration, calendar validation, clearing, independent persistence, and persistence across process restarts.
