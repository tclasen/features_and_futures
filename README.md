# Workboard

Requires Node.js 22.22.1. No packages need to be installed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. Configure the port and persistent SQLite database path with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

On a project page, create tasks, toggle their completion checkboxes, and use
`Task filter` to view All, Open, Completed, or Deleted tasks. Projects and tasks persist
in the configured SQLite file across server restarts.
Completion checkboxes save in place and immediately hide tasks that no longer
match the selected filters, preserving the current page controls and input drafts.

Use `Project filter` to switch between Active and Archived projects. Project
rows show completion totals and let you archive or restore a project. Archived
projects remain readable with working task filters; task creation and completion
changes are disabled until restoration. Existing databases migrate automatically.

Use `New project name` and `Rename project` on an active project page to rename
it. Names are trimmed and required. Renaming preserves the project's URL,
creation order, tasks, and completion totals. Archived projects must be restored
before they can be renamed.

Each task row provides `New task title` and `Rename task`. Titles are trimmed
and required. Renaming preserves task ownership, creation order, completion,
filter membership, and project completion totals. Archived projects disable
task renaming until restoration. Renamed titles persist across server restarts.

Each task row has a `Task priority` selector with Low, Normal, and High options.
Existing tasks default to Normal when migrating from databases without priorities.
Priorities persist independently across
reloads and restarts, including after renaming, archiving, and restoration.
Archived projects disable priority edits until restoration.

Use `Priority filter` (All, Low, Normal, High) together with `Task filter` to
show tasks matching both selections in creation order. Both filters stay selected
through task edits, including when an edited task no longer matches. Filters work
on archived projects and never change saved data or completion totals. Opening
a project from the project list starts both filters at All.

Use `Default task priority` (Low, Normal, High) on each project page to choose
the priority for subsequent tasks. Each project starts at Normal. Changing the
default preserves existing tasks and both selected filters. Defaults persist
independently across reloads, restarts, renaming, archiving, and restoration.
Archived projects show the saved default but disable changes until restoration.

Each task row has a `Task due date` textbox and `Save due date` button.
Save a real Gregorian date in YYYY-MM-DD format (years 0001–9999), or save
an empty value to clear it. Surrounding whitespace is trimmed. Invalid dates
show an alert and preserve the saved date. Dates persist as calendar days,
independently of timezones, and preserve all other task data and both filters.
Archived projects disable date edits until restoration.

Use `Due from`, `Due through`, and `Apply due range` to filter by inclusive
calendar-date boundaries alongside completion and priority. Blank boundaries
are unbounded; undated tasks match only when both boundaries are blank.
Invalid dates or reversed ranges show an alert and retain the applied range.
Edits and filter changes retain the range, and archived projects allow range
filtering. Opening a project from the list starts with empty range boundaries.
Filtering never changes saved task data or the all-task completion summary.

Each task row provides `Destination project` and `Move task` to move it to
another active project. Destinations use current project names in project
creation order. First visits append after all positions established in the
destination; returning tasks resume their remembered position in that project.
Positions are saved independently for each project, even while a task is away,
and survive restarts, project renaming, archival and restoration. Moves preserve
title, completion, priority and due date, and retain the source page's filters.
Both completion summaries reflect the new ownership. Task order and ownership
persist across restarts. Archived projects cannot send or receive tasks; move
controls are also disabled when there are no eligible destinations.

Run the integration checks with:

```sh
npm test
```

Use `Project search` and `Search projects` to match project names within the
selected Active or Archived list. Use `Task search` and `Search tasks` to match
titles alongside completion, priority and due-range filters. Searches ignore
ASCII letter case and trim surrounding query whitespace. Runs of ASCII spaces
and horizontal tabs in queries and names/titles match as one space, without
rewriting saved or displayed text. Other internal whitespace remains literal.
Blank queries match all rows allowed by the other filters.
Task edits and moves retain the applied search and filters. Searches work on
archived projects and do not change stored data or all-task summaries. Opening
a project from the list, or returning via `Projects`, starts with an empty query.

Each task row has a multiline `Task notes` textarea and `Save notes` button.
Notes are saved as plain text, preserving whitespace, line breaks, Unicode and
literal markup. Empty text clears notes. Existing and new tasks start with empty
notes. Notes persist across reloads, restarts, renaming, moves and remembered
return positions, without changing other task data or the selected filters.
Searches continue to match only project names and task titles. Archived projects
display saved notes with editing disabled until restoration.

Live task rows provide `Delete task`. Deleted tasks keep all fields and remembered
positions, but leave the live lists and completion summaries. Select `Deleted`
to read them using the same priority, date and title filters, then `Restore task`
to return them to their reserved positions. Deleted task editing and movement
are disabled until restoration. Archived projects disable deletion and restoration
while keeping filters usable. Deletion persists across restarts; upgrades preserve
existing tasks as live.

Use `Download project` on any project page to download UTF-8 JSON named
`workboard-project.json` (format `workboard-project`, version 1). The document
contains the project's name, archive state and default priority, plus all its
live and deleted tasks in stored order with title, completion, explicit priority,
due date, notes and deletion state. Downloads ignore the selected filters and
search, and leave all saved data and page selections unchanged. Exported notes
use LF line endings without rewriting the stored notes. Archived and empty
projects can also be downloaded.

On the home page, paste a version 1 portable document into `Project JSON`, enter
an `Imported project name`, and select `Import project`. The override name is
trimmed and required. The complete document is validated before a single
transaction creates a new independent project and opens it. Invalid documents
show `Invalid project JSON`, retain both inputs, and leave existing data unchanged.
Imports retain archive state, default priority, task order, exact titles,
completion, explicit priorities, dates, notes (with LF line endings), and deletion
state. Internal identities are always newly allocated. Deleted tasks retain their
reserved positions for restoration and later moves/returns. Archived imports
remain read-only until restored.

Select `Task directory` on the home page to read tasks across projects. Each
opening starts with Active project scope, All task and priority filters, and
empty search and due range. Scope, live/deleted status, priority, inclusive date
range and normalized title search intersect without changing saved data. Results
follow project creation order and each project's stored task order, and show the
original title, owner name, completion, priority, due date and literal notes.
Directory rows contain no task editing controls. `Open project` opens the owner
with default project filters, including archived owners; `Projects` returns home.
Imported and upgraded tasks appear with their saved fields and public defaults.

Use `Complete visible tasks` or `Reopen visible tasks` in the directory to update
all matching live tasks across active projects. Current filters, search and due
range remain selected; results and project summaries reflect the saved completion
state. Each action is disabled when no visible task needs that change, and both
are disabled for Archived scope or Deleted tasks. Other fields and remembered
positions remain unchanged. Empty resolved results show `No matching tasks`;
the announcement is hidden while a new directory page is loading.

Use `Directory order` to view results in Original, Priority (High first), Due date
(earliest first, undated last), or Title order. Title ordering folds only ASCII
uppercase letters and compares Unicode code points, preserving literal internal
whitespace. Ties retain original project/task order. The selection stays through
filtering, searches, date ranges and bulk actions; each new directory opening
starts at Original. Ordering never changes stored order, exports or remembered
return positions.
