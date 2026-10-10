# Workboard

Requires Node.js 22.22.1. No dependencies need to be installed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Create projects and open them to create tasks,
toggle completion, and filter by All, Open, or Completed. The database persists
projects, tasks, completion state, and archive state between restarts. The project
list filters Active or Archived projects and shows completion totals. Archived
projects remain viewable with task filters, but tasks cannot be changed until
the project is restored. Active projects can be renamed from their project page;
renaming preserves the project URL, creation order, and all saved tasks. Archived
projects can be renamed after restoration.
Each task row also supports renaming while preserving its completion state,
project ownership, and creation order. Task renaming is disabled while archived
and becomes available again after restoration.
Each task has an independent Low, Normal, or High priority.
Priority selections persist across restarts and are disabled while archived;
restoration enables editing with the saved priority intact.
Project pages combine the completion filter with an All, Low, Normal, or High
priority filter. Both selections remain in place when editing tasks, and archived
projects keep both filters available. Completion totals always count all tasks.
Each project has a saved Default task priority, initially Normal. New tasks inherit
this value; changing it leaves existing tasks and both filters unchanged. Defaults
persist across restarts, renaming, archival and restoration, and cannot be edited
while archived.
Tasks support optional due dates. Save a real Gregorian date in YYYY-MM-DD format
(years 0001–9999), or leave the textbox blank to clear it. Dates persist without
timezone conversion. Invalid dates leave saved data unchanged; archived projects
disable date editing until restoration.
`GET /health` returns `{"status":"ok"}`.

Run the integration checks with `npm test`.
