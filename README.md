# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file
to preserve projects, archive state, tasks, and completion state across server
restarts. Existing databases are migrated automatically. Each project supports
task creation, completion, and All/Open/Completed filters. The project list has
Active/Archived filters and completion summaries. Archive projects to make their
tasks read-only; restore them from the Archived list to resume editing.
Active project pages also support renaming. Names are trimmed and required;
renaming preserves the project's URL, position, tasks, and completion state.
Archived projects cannot be renamed until restored. Renamed project names
persist in the same SQLite database.
Each active task row supports renaming with a trimmed, required title. Task
renaming preserves ownership, creation order, completion, and filter membership.
Archived task rename controls are disabled until the project is restored.
Each task has a saved Low, Normal, or High priority. Existing tasks default to
Normal. Priority changes preserve task order, ownership, title,
and completion. Archived priority controls are disabled until restoration.
Project pages also have an All/Low/Normal/High priority filter. Both task filters
apply together and keep their selections through completion, priority, and rename
edits. Filters remain usable on archived projects and never change saved tasks
or completion summaries. Opening a project from the list starts with both
filters set to All.
Each project has a saved Default task priority, initially Normal. New tasks
inherit that project's current default; changing it leaves existing tasks and
both filters unchanged. Defaults survive renaming and restarts, and the default
control is disabled while archived and enabled again after restoration.
Each task supports an optional due date. Save a real Gregorian date in
YYYY-MM-DD format (years 0001–9999), or leave it blank to clear it. Dates are
saved as calendar days without timezone conversion. Invalid dates leave the
saved date unchanged. Due-date controls are disabled while the project is
archived; restoration preserves dates and enables editing again.
Project pages support inclusive Due from/Due through filtering with Apply due
range. Blank boundaries are unbounded; undated tasks match only when both are
blank. The range intersects completion and priority filters and stays applied
through edits. Invalid dates or reversed ranges leave the applied range intact.
All filters remain usable while archived. Reopening from the project list clears
the range and selects All for both comboboxes.
Each task can move to another active project using Destination project and Move
task. First arrivals append after all positions established in the destination;
returning tasks recover their previous position in that project, even when
multiple tasks return in a different order. Each project's remembered positions
survive renaming, archival, restoration, and restarts. Moves preserve title,
completion, priority, and due date. The source page keeps its filters and applied
range. Archived projects cannot send or receive tasks, and move controls are
disabled when no eligible destination exists. Moves and task ordering persist
across restarts; completion summaries reflect each project's current tasks.
Project search intersects Active/Archived selection. Task search intersects
completion, priority, and the applied due range. Both match substrings ignoring
ASCII letter case and trimming surrounding query whitespace; internal whitespace
remains significant. Task search stays applied through edits and moves. Searches
remain usable while archived and never affect saved data or summary counts.
Opening the list through Projects clears project search; opening a project from
the list clears task search and its other filters.
`GET /health` returns
`{"status":"ok"}`.

Run the integration checks, including a server restart using a temporary SQLite
database:

```sh
npm test
```
