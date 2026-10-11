# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to 8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the configured SQLite file to preserve projects, archive state, tasks, and completion state across restarts. Existing databases are automatically upgraded with active projects, Normal task priorities, and Normal project defaults, and empty task due dates without changing existing task data. Its parent directory is created automatically.

`GET /health` returns HTTP 200 with `{"status":"ok"}`.

The application uses server-rendered HTML and native forms. SQLite assigns an internal creation sequence for stable project and task ordering; public IDs are UUIDs. Project names and task titles are trimmed before saving and escaped when rendered. Active project pages provide a New project name field and Rename project button. Renaming preserves the URL, creation order, tasks, completion state, and summaries; blank names are rejected. Each project page supports task creation, saved completion checkboxes, and All, Open, and Completed filters. Each task row provides a New task title field and Rename task button. Task renaming trims and validates the title, updates the completion label, and preserves ownership, order, completion, and summaries. Each task provides a Task due date textbox and Save due date button. Empty or whitespace-only values clear the date; other values are trimmed and must be real Gregorian days in YYYY-MM-DD format with years 0001–9999. Dates are saved as calendar-day strings without timezone conversion; invalid values leave the saved date unchanged. Date edits preserve all other task data and both filters. Each task also has an independently saved Task priority selector with Low, Normal, and High options. Each project has a saved Default task priority selector with the same options, initially Normal. New tasks inherit their project's current default; changing a default never changes existing tasks. Defaults remain independent between projects and survive renaming, archival, restoration, and restarts without resetting either task filter. Each project page also provides a Priority filter with All, Low, Normal, and High options. Completion and priority filters combine, retaining creation order and both selections during task edits. Opening a project starts with both filters set to All. Priority and completion edits immediately re-evaluate matching rows; summaries always count all tasks. Filter selections are carried in the page URL and forms, not saved as task data. The project list defaults to Active, with an Archived filter and archive/restore controls. Project summaries count all completed and total tasks. Archived project pages retain task filtering but disable project and task renaming, task creation, completion changes, priority edits, due-date edits, and default-priority changes, including direct POST requests. Restoring a project preserves its tasks. Small browser event handlers submit completion, priority, and filter changes automatically.

## Verify

```sh
npm test
```

The tests launch real HTTP servers with temporary SQLite files and check validation, creation order, navigation, HTML escaping, health, project isolation, task filtering, completion updates, archive/restore, read-only enforcement, completion summaries, legacy database migration, project and task renaming without identity or data loss, persistent task priorities (including migration, validation, isolation, and archive protections), combined completion/priority filtering, selection retention and row re-evaluation after edits, project-default migration, inheritance, isolation, validation, filter retention and archive protections, strict Gregorian date boundaries, due-date migration, validation, clearing, isolation and archive protections, and persistence across process restarts.
