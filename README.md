# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to
the SQLite file to use; the default is `data/workboard.sqlite`. Parent
directories are created automatically. Keep this file across restarts to
preserve project names, IDs, tasks, completion state, and archive state.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. Projects are created with trimmed,
nonempty names and displayed in creation order. Project pages use persistent
IDs at `/projects/<id>`. Each project has tasks with trimmed, nonempty titles,
saved completion state, and All/Open/Completed filters in creation order.
Small browser event handlers submit filter and checkbox changes using forms.
The project list defaults to Active and also offers Archived projects. Archive
and restore preserve all tasks. Archived project pages allow task filtering,
but task creation and completion changes are disabled and rejected by the server.
Project summaries count all tasks, regardless of task filters. Existing databases
are migrated automatically with all previous projects remaining active.
Active project pages also support renaming with trimmed, nonempty names. Renaming
preserves the project URL, creation order, tasks, and completion summary. Archived
projects disable rename controls and reject rename requests until restored.
Each task row also supports renaming with a trimmed, nonempty title. Task renames
preserve ownership, creation order, completion state, and summaries, and update
the completion checkbox label. Archived projects disable task rename controls
and reject task rename requests until restored. Renamed titles persist in SQLite.
Each task has a saved Low, Normal, or High priority. Existing tasks default to
Normal when migrated. Priority changes preserve task order, ownership, title,
completion, and summaries; renaming preserves priority. Archived projects disable
priority controls and reject priority changes until restored.

Project pages combine the All/Open/Completed task filter with an
All/Low/Normal/High priority filter. Tasks must match both filters, retaining
creation order. Both selections stay in the page URL and are preserved by task
edits, including validation errors. Priority and completion changes immediately
re-evaluate matching rows. Opening a project from the list starts both filters
at All. Filtering is available on archived projects and never changes saved task
data or completion summaries.

Each project has a saved Default task priority (Low, Normal, or High), initially
Normal for both new and existing projects. New tasks inherit the project's saved
default at creation; changing the default leaves existing tasks and both selected
filters unchanged. Defaults are independent per project and persist through
reloads, restarts, renaming, archive and restore. Archived projects display their
saved default in a disabled control and reject changes until restored.

Tasks have an optional saved due date. Save due date accepts a trimmed Gregorian
calendar date in `YYYY-MM-DD` format (years 0001–9999); blank input clears it.
Invalid dates display an alert and preserve the saved date. Dates use no timezone
conversion, default to empty for existing and new tasks, and persist across
restarts. Saving a date preserves all other task data, both filters, and project
summaries. Archived projects disable due-date controls and reject saves until
restored.

Project pages also offer Due from and Due through textboxes with Apply due range.
The trimmed Gregorian boundaries are inclusive; either blank boundary is unbounded.
With any boundary present, undated tasks are excluded. With both blank, all dates
and undated tasks match. The range intersects completion and priority selections
and preserves creation order and all-task summaries. Invalid or reversed ranges
show an alert and retain the previously applied range. The applied range stays in
the URL and all editing forms, including validation errors, and remains usable
in archived projects. Opening a project from the list starts with empty boundaries.
