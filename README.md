# Workboard

Requires Node.js 22.22.1. No installation or external dependencies are needed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects, view completion summaries, and filter Active or Archived projects. Archive and restore projects from their rows. On each project page, create tasks, toggle their completion, and filter by All, Open, or Completed combined with All, Low, Normal, or High priority. Both filters retain their selections during edits and show matching tasks in creation order; opening a project from the list starts with both set to All. Active projects can be renamed with a trimmed, nonblank name without changing their identity, order, or tasks. Each task row supports renaming with a trimmed, nonblank title, preserving ownership, order, completion and summaries. Each task also has an independent Low, Normal, or High priority that persists without changing its other data. Each project has a saved Default task priority, initially Normal; newly created tasks inherit it, while existing tasks remain unchanged. Changing this default preserves both task filters. Defaults persist across renaming, archival, restoration and restarts, and the default control is disabled when archived. Each task has an optional Task due date textbox and Save due date button. Saving trims the input; an empty value clears the date, and nonempty values must be real Gregorian dates in YYYY-MM-DD format (years 0001–9999). Invalid dates show an alert without changing saved data. Due dates persist independently and preserve both filters and other task data. Project pages also provide Due from and Due through textboxes and Apply due range. Valid trimmed boundaries filter dates inclusively, intersecting completion and priority filters; blank sides are unbounded, and undated tasks match only when both sides are blank. Invalid dates or reversed ranges show alerts and retain the previous applied range. Edits and combobox changes retain the applied range, while reopening from the project list starts with blank boundaries. Each task row offers Destination project and Move task controls. Destinations are other active projects in project creation order. Moves keep the source page and its filters open, append the task after the destination's tasks, and preserve task identity, title, completion, priority and due date. Both project summaries update. Moves are disabled without eligible destinations or in archived projects; archived projects cannot receive tasks. Archived projects remain readable and filterable but cannot be renamed or have tasks created, renamed, reprioritized, due dates edited or completion changed. Projects, names, archive state, and tasks persist in the configured database across restarts; existing databases are migrated automatically. `GET /health` returns `{"status":"ok"}`.

Run the integration tests (using temporary databases outside the repository):

```sh
npm test
```
