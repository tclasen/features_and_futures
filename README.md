# Workboard

Requires Node.js 22.22.1. No package installation or external dependencies are needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the same database
path across restarts to preserve projects, tasks, completion state, and archives.
Active projects can be renamed without changing their URLs, order, or tasks.
Each project provides task creation, completion checkboxes, and All/Open/Completed
filters combined with an All/Low/Normal/High priority filter. Both selected filters
are retained through task edits, and matching tasks stay in creation order. Each task can be renamed while preserving its completion state, project,
and creation order. Each task has an independent Low/Normal/High priority saved across
restarts. Each project has a saved Default task priority, initially Normal, which
applies only to subsequently created tasks. Archived projects disable this setting.
The project list provides Active/Archived filters and completion summaries.
Each task has an optional saved due date. Enter a real Gregorian date in
`YYYY-MM-DD` format (years 0001–9999), or leave it blank to clear it. Due dates
persist across restarts and are read-only while the project is archived.
Use Due from and Due through with Apply due range to intersect an inclusive date
range with both task filters. Blank boundaries are unbounded; any nonblank boundary
excludes undated tasks. Invalid ranges preserve the last applied range. Edits retain
the applied range, and reopening a project from the list clears it. Range controls
remain available in archived projects.
Use Destination project and Move task to append a task to another active project.
Moving preserves completion, priority and due date, updates both summaries, and
keeps the source project open with its filters. Moves and task order persist across
restarts. Archived projects cannot send or receive tasks.
Archive projects to make their names and tasks read-only; restore them to resume editing.
Existing databases are upgraded automatically. `GET /health` returns `{"status":"ok"}`.

Run the integration checks with:

```sh
npm test
```
