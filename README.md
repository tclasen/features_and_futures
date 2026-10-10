# Workboard

Requires Node.js 22.22.1; no dependencies or install step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `./data/workboard.sqlite`.
The server binds to `0.0.0.0`. `GET /health` returns `{"status":"ok"}`.

```sh
npm test
```

Project pages support task creation, completion checkboxes, and combined All/Open/Completed and All/Low/Normal/High priority filtering. Both filters retain their selections during task edits and remain usable in archived projects. The project list provides Active/Archived filtering, archive/restore controls, and completion summaries. Active project pages also support project and task renaming without changing identity, ownership, order, or completion state. Each task has an independent Low/Normal/High priority. Each project has a saved Default task priority (initially Normal); new tasks inherit it, while existing tasks remain unchanged. Default changes preserve both task filters. Each task also has an optional Task due date textbox and Save due date button. Dates are trimmed, validated as real Gregorian YYYY-MM-DD dates (years 0001–9999), and saved without timezone conversion; blank values clear them. Invalid dates show an alert without changing saved data. Due from and Due through textboxes apply an inclusive due-date range intersecting completion and priority filters. Blank boundaries are unbounded; any nonblank boundary excludes undated tasks. Invalid or reversed ranges show an alert and retain the previously applied range. Task edits immediately re-evaluate membership without resetting filters; reopening a project resets the range to empty. Range controls remain usable on archived pages. Archived project pages are read-only, including rename, priority, default, and due-date controls. Task rows provide a Destination project selection and Move task button. Eligible destinations are other active projects in creation order; moves append the task to the destination, preserving all task data and the source's filters. Archived projects cannot send or receive tasks. Controls are disabled when no destinations are eligible. Projects, names, tasks, priorities, due dates, project defaults, task order and ownership, and archive state are saved in SQLite; existing databases are migrated automatically.

Browser-script tests exercise combined filter combinations, edit-driven row updates, selection preservation, default inheritance, and archived controls using a dependency-free DOM adapter. Server tests exercise health, project/task validation, creation order, project isolation, completion changes, detail routes, schema migration, archive/restore, read-only enforcement, summaries, project/task rename validation and identity preservation, priority defaults/validation/isolation and migration of existing tasks, project default validation/isolation/inheritance, preservation through rename/archive/restore, and SQLite persistence across process restarts using a temporary database. Due-date tests cover calendar validity, trimming/clearing, independent ownership, schema migration, persistence, rename preservation, archived restrictions, and unchanged filter selections. Range tests cover inclusive and one-sided boundaries, undated tasks, invalid/reversed ranges, combined filters, edit-driven membership, creation/rename/default preservation, archived use, and reopening resets.
