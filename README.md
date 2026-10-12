# Workboard

Requires Node.js 22.22.1. No dependencies or installation step are needed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). SQLite data is
stored at `DB_PATH` (default `./data/workboard.sqlite`). For example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Each project supports task creation,
completion checkboxes, and All, Open, and Completed filters. A Priority filter
offers All, Low, Normal, and High; tasks must match both selected filters.
Task edits retain both filter selections and immediately update matching rows.
Each task's Low, Normal, or High priority is saved independently and cannot be
edited while its project is archived. The Default task priority selection starts
at Normal and is saved per project. New tasks inherit the saved default;
changing it leaves existing tasks and both filters unchanged. Archived projects
display the saved default with editing disabled until restored. The project list
shows completion summaries and Active/Archived filters, with archive and restore
controls. Archived projects keep their tasks visible while task creation and
completion changes are disabled. Active projects can be renamed with the
New project name field; renaming preserves their URL, order, and tasks. Archived
projects cannot be renamed until restored. Each task has a New task title field
and Rename task button; renaming preserves ownership, order, and completion.
Archived projects disable task renaming until restored.
Each task also has a Task due date textbox and Save due date button. Dates are
optional and must be real Gregorian dates in YYYY-MM-DD format, with years
0001–9999. Saving a blank value clears the date; invalid values leave the saved
date unchanged. Due dates persist independently without timezone conversion,
and archived projects disable date editing until restored.
Due from and Due through textboxes apply an inclusive calendar-date range with
Apply due range. Blank boundaries are unbounded; both blank includes undated
tasks, while any boundary excludes them. The range intersects completion and
priority filters, survives edits and filter changes, and remains usable in
archived projects. Invalid ranges retain the previous applied range. Opening a
project from the list starts with empty boundaries. Summaries always count all
tasks regardless of filters.
Each task has a Destination project selection and Move task button. Destinations
are other active projects in project creation order. Moving to a new project
appends after all positions established there. Returning to a previous project
restores the task's remembered position relative to its other tasks, even when
tasks return in a different order. Moving preserves current title, completion,
priority and due date, and keeps the source page open with its filters unchanged.
Both summaries update to
reflect current ownership. Move controls are disabled for archived sources or
when no active destination exists. Saved ownership and ordering survive restarts.
Project search and Search projects match project names by substring within the
selected Active/Archived filter. Task search and Search tasks intersect the
completion, priority and applied due-range filters. Both searches ignore ASCII
letter case and trim surrounding query whitespace while preserving internal
whitespace. Blank queries match everything allowed by the other filters.
Task edits preserve the applied search and filters and immediately update
matching rows; summaries still count all tasks. Search remains available in
archived projects. Opening a project from the list or returning via Projects
starts with an empty search.
Existing databases are migrated automatically.
Projects, names, tasks, and archive state persist across server restarts. `GET /health` returns
`{"status":"ok"}`. Run the integration checks with `npm test`.
