# Workboard

Requires Node.js 22.22.1. No package installation is needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0` and exposes
`GET /health`. `PORT` defaults to `8080`; `DB_PATH` defaults to
`./data/workboard.sqlite`. Keep the database file to retain projects, tasks and completion state across
restarts, including archive state.

The project list starts with Active projects. Use Project filter to view Archived
projects and restore them. Each row shows completed and total live task counts.
Project search matches names by substring and intersects Project filter. Task
search matches titles and intersects completion, priority and due-range filters.
Search ignores ASCII letter case, trims surrounding query whitespace and treats
runs of ASCII spaces and tabs as one space without changing saved names or titles.
Apply queries with Search projects or Search
tasks; clear and apply to match all rows allowed by the other filters. Edits keep
the applied task query and re-evaluate matching rows. Search works in archived
projects. Opening either page starts with an empty query.
Each task has a saved Low, Normal, or High priority, initially Normal. Changing
priority preserves its title, completion state and position. Archived project
pages allow task filtering but disable task creation, completion, renaming and
priority changes. Restoring a project enables editing with saved values intact.
Task filter and Priority filter work together, initially selecting All. Changes
to completion or priority immediately update the matching rows while preserving
both filter selections. Project summaries count all live tasks regardless of the selected filters.

Tasks can also save or clear a calendar due date. Due from and Due through
apply an inclusive date range together with Task filter and Priority filter.
Either boundary may be blank; a range with any boundary excludes undated tasks.
Invalid ranges leave the previous applied range intact. Editing a task updates
matching rows, and opening a project starts with an empty range. Archived
projects allow all filters while keeping saved task data read-only.

Task notes saves optional multiline plain text exactly as entered, including
spaces, line breaks, Unicode and literal markup. Empty text clears notes. Notes
persist across restarts and moves, and do not participate in search. Archived
projects display notes with their editing controls disabled.

Delete task hides a live task from All, Open and Completed and excludes it from
project summaries. Select Deleted to read deleted tasks under the same priority,
due-range and title search filters. Restore task restores its saved fields and
reserved position; newer tasks follow it. Deleted tasks cannot be edited or moved.
Deletion persists across restarts, and archived projects disable both deletion
and restoration while retaining all filters.

Download project saves `workboard-project.json`, a UTF-8 portable JSON document
with format `workboard-project` and version `1`. It includes the project's name,
archive state and default priority, plus all live and deleted tasks in their
stored order with title, completion, priority, due date, notes and deletion state.
Downloads work in archived and empty projects and leave stored data and page
filters unchanged. Exported notes use LF line endings without changing saved notes.

Move task sends a task to another active project, preserving its title,
completion, priority and due date. First arrivals append after all positions
established in the destination; returning tasks recover their remembered
position in that project, even across restarts. New tasks also follow established
positions, including those reserved for tasks currently elsewhere. The source
page keeps all selected filters. Archived projects cannot send or receive tasks;
moving is disabled when no active destination is available.

Run the integration checks:

```sh
npm test
```

Tests use a temporary database outside the repository and remove it afterward.
