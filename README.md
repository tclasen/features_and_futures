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
letter case and trim surrounding query whitespace. For matching only, runs of
ASCII spaces and horizontal tabs become one space in queries and names/titles;
saved names and titles retain their original whitespace and case. Blank queries
match everything allowed by the other filters.
Task edits preserve the applied search and filters and immediately update
matching rows; summaries still count all tasks. Search remains available in
archived projects. Opening a project from the list or returning via Projects
starts with an empty search.
Existing databases are migrated automatically.
With JavaScript enabled, form updates keep the page in place and temporarily
disable controls until the server has saved the change and returned resolved
results. This prevents a following interaction from interrupting a save. Empty
directory announcements stay hidden during updates. Validation still uses the
server's rules, and project downloads use the browser's normal download handling.
Each task has a multiline Task notes textarea and Save notes button. Notes are
saved as plain text without trimming, including whitespace, Unicode and literal
markup. Empty text clears notes. Notes persist through restarts, renames, moves
and return-position restoration without affecting search or filters. Archived
projects display saved notes with editing disabled until restored. Existing
tasks receive empty notes during migration without changing other saved data.
Live tasks can be deleted and restored without losing fields or remembered
positions. The Deleted task filter shows deleted tasks with editing disabled;
All, Open, Completed and project summaries count only live tasks. Archived
projects disable deletion and restoration while retaining readable filters.
Every project page provides Download project, including archived projects.
It downloads UTF-8 `workboard-project.json` with format `workboard-project`,
version `1`, project name/archive/default priority, and all live and deleted
tasks in stored order. Export ignores page filters, preserves original names
and titles, and includes completion, priority, due date, notes and deleted state.
Notes line endings become LF only in the export. Downloading changes neither
stored data nor page selections; remembered return positions remain in the app.
The home page offers Project JSON, Imported project name and Import project.
Import validates the complete version-1 document before saving anything, then
creates an independent project with the trimmed override name and opens it.
All task fields, live/deleted order, archive state and default priority are
preserved; imported notes use LF line endings. Imported identities and return
positions are new and independent of the original project. Invalid documents
or blank override names display an alert and retain the submitted form values
without changing existing data.
Task directory on the home page opens a read-only view across projects. Project
scope (Active or Archived), live/deleted completion filters, priority, inclusive
due range and normalized task-title search intersect without changing saved
data. Directory order offers Original, Priority (High first), Due date (dated
tasks first, earliest first), and Title (ASCII case folded, Unicode code point
order). Equal keys keep Original order: project creation order and each
project's stored task order. Ordering survives directory filters and bulk
actions without changing project views, exports or remembered positions.
Results show original titles, owner names, completion, priority, due dates
and literal notes. The directory summary shows completed/total counts for the
current matching result, including retained completion flags in Deleted views.
It updates with filters and bulk actions; ordering does not change the counts.
Empty resolved results show `0/0 completed` and `No matching tasks`.
Open project navigates to the owner with fresh project-page
filters; Projects returns to the home page. Each directory opening starts with
Active scope, All completion/priority filters, Original order and empty range/search.
Projects, names, tasks, and archive state persist across server restarts. `GET /health` returns
`{"status":"ok"}`. Run the integration checks with `npm test`.
