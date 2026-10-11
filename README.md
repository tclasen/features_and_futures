# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step are needed.

```sh
npm start
```

The server binds to `0.0.0.0` using `PORT` (default `8080`). SQLite data is stored
at `DB_PATH` (default `data/workboard.sqlite`); keep this file to preserve projects and tasks
across restarts. Parent directories are created automatically.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm test
npm run check
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. The application uses
server-rendered HTML and standard browser forms. Project names are trimmed on
creation and escaped for display; project IDs provide stable URLs.
Each project owns its tasks. Task titles are trimmed and escaped for display.
Completion changes are saved immediately; the All, Open, and Completed filters
retain creation order. The selected filter is stored in the project page URL.

The project list initially shows Active projects; choose Archived to open or
restore archived projects. Archiving preserves tasks and completion state but
disables task creation and completion changes, including direct POST requests.
Each project summary counts all its live tasks regardless of task filters. Existing
SQLite databases are migrated automatically, with existing projects initially
active. Archive state and task data persist across restarts.

Active projects can be renamed from their project page. Names are trimmed and
must not be blank. Renaming preserves the project ID, URL, creation order, tasks,
and completion summary. Archived projects cannot be renamed until restored;
this restriction also applies to direct POST requests. Renamed names persist
across restarts.

Each task in an active project can be renamed using its New task title field.
Titles are trimmed and must not be blank. Renaming preserves ownership,
creation order, completion state, filter membership, and completion summaries.
The displayed title and completion checkbox label update together. Archived
projects disable task renaming and reject direct rename requests until restored.
Renamed titles persist across restarts.

Each task has a Task priority selector with Low, Normal, and High options.
Existing tasks default to Normal during migration. Changes save immediately and persist
across restarts without changing task order, ownership, completion, or summaries.
Renaming preserves priority. Archived projects disable priority selectors and
reject direct priority changes; restoration preserves and enables them again.

Project pages also have a Priority filter with All, Low, Normal, and High options.
Tasks must match both the completion and priority filters, retaining creation
order. Both selections are carried in the page URL and through edits and
validation errors. Changes to completion or priority immediately re-evaluate
matching rows. Opening a project from the list starts both filters at All.
Filters remain usable while archived and never change saved tasks or summaries.

Each project has a Default task priority selector with Low, Normal, and High
options, initially Normal. Changes save immediately and apply only to tasks
created afterward in that project. Existing tasks and both selected filters stay
unchanged. Defaults persist through restarts, renaming, archival, and restoration.
Archived projects display their saved default in a disabled selector and reject
direct changes until restored.

Each task has a Task due date textbox and Save due date button. Dates are optional:
blank input clears the saved date. Nonempty values are trimmed and must be real
Gregorian dates in YYYY-MM-DD format with years 0001–9999. Invalid dates show an
alert and leave saved data unchanged. Calendar dates are stored as text without
timezone conversion. Existing and new tasks start with no due date. Dates persist
through restarts and renaming; saving preserves both filters and other task data.
Archived projects disable date editing and reject direct saves until restored.

Project pages provide Due from and Due through textboxes and an Apply due range
button. Boundaries use the same calendar validation as task due dates and are
inclusive. Either blank boundary is unbounded; with both blank, undated tasks
also match. Otherwise undated tasks are excluded. The range intersects the
completion and priority filters while preserving task order and all-task summaries.
Invalid applications display an alert and preserve the previously applied range
and visible rows. Applied boundaries travel in the page URL and hidden form
fields, separately from draft range inputs, so task edits, validation errors,
renaming, creation, default changes, and combobox changes retain the applied range.
Range controls remain available while archived. Reopening from the project list
uses the bare project URL and resets both boundaries to empty.

Each task row provides Destination project and Move task controls. Destinations
are other active projects in project creation order, using their current names.
Moving to a project for the first time appends the task while preserving its identity, title,
completion, priority, and due date. The source stays open with its filters intact;
both summaries count their updated ownership. Task order is stored independently
of identity, and existing databases migrate without changing their current order.
Archived projects cannot send or receive tasks. Controls are disabled when the
source is archived or there are no eligible destinations, and direct requests
validate ownership and destination eligibility before changing data.

Each task remembers its ordering position separately in every project it visits.
Returning restores that position relative to other tasks, even when multiple tasks
return in a different order. New tasks and first-time arrivals come after all
established positions, including those reserved by tasks currently away. Positions
persist across restarts, project renaming, archival, and restoration. Returning
keeps current task fields rather than restoring old values. Creation and movement
save ownership and remembered positions together in a SQLite transaction.

Project search and Task search apply substring queries, trimming surrounding
query whitespace and ignoring ASCII letter case. For matching only, each run of
ASCII spaces and horizontal tabs in the query and saved name/title becomes one
space. Original saved names and titles are preserved and displayed unchanged.
Other internal whitespace remains significant. Search intersects each page's
existing filters without changing saved data, task order, or all-task summaries.
Applied queries travel in the URL and form
fields through edits, movement, and validation errors; task membership is immediately
re-evaluated after changes. Task search stays usable on archived projects. Opening
from the project list or returning via Projects uses a bare URL with an empty query.

Each task has a multiline Task notes textarea and Save notes button. Notes are
plain text saved without trimming, including whitespace, line breaks, Unicode,
and literal markup. Empty text clears them. Existing databases add only an empty
notes field to each task. Notes persist through restarts, edits, moves, and remembered
return positions without affecting other task fields, summaries, or search matching.
Saving retains all applied filters and search. Archived projects display saved
notes but disable editing and reject direct saves until restored.

Task filter also offers Deleted after All, Open, and Completed. The first three
filters and project summaries count only live tasks. Delete task preserves all
saved fields, ownership, and remembered positions; Restore task returns the same
task at its reserved position. Both actions retain the applied filters, range,
and search. Deleted rows remain readable with all editing and move controls
disabled, and direct editing requests are rejected until restoration. Archived
projects also disable deletion and restoration. Deletion survives restarts;
existing databases initialize every earlier task as live without changing data.

Every project page provides Download project, including archived and empty projects.
`GET /projects/<id>/export` downloads UTF-8 JSON as `workboard-project.json` with
format `workboard-project`, version `1`, and the project's name, archive state,
default priority, and all current live/deleted tasks in stored order. Export ignores
page filters and includes each task's title, completion, priority, due date, notes,
and deletion state. Notes line endings become LF in the portable document only.
Downloading does not change stored data, remembered positions, or page controls.

The home page's Project JSON textarea and Imported project name field import a
version 1 portable document into a new independent project. The override name is
trimmed and required. The complete document is validated before any writes, then
the project, tasks, and initial remembered positions are saved in one SQLite
transaction. Invalid imports retain both submitted fields and change no data.
Imports preserve task order, exact titles, completion, explicit priorities, dates,
notes (with LF line endings), deletion state, project default, and archive state.
Additional JSON properties cannot supply internal IDs or remembered positions.
Imported tasks follow the same editing, restoration, movement, and persistence
rules as other tasks. Import form bodies support up to 10 MiB.

Task directory on the home page opens `/directory`, a cross-project
view. Each opening starts with Active project scope, All task and priority filters,
and empty search and due range. Scope, live/deleted status, priority, inclusive
due boundaries, and title-only search intersect using the same rules as project
pages. Applying one control preserves the others; invalid ranges retain the
previous applied range and matching rows. Results follow project creation order
and each project's stored task order. Original titles, owner names, completion,
priority, dates, and literal multiline notes are displayed without editing controls.
Open project uses the owner's bare URL to reset project-page filters; Projects
returns to the home page with its default filters. Viewing and filtering never
write project or task data.

Complete visible tasks and Reopen visible tasks change only the completion state
of matching live tasks in Active scope. Each action resolves the current filters,
search, and applied due range and saves changes in one transaction, then returns
to those same selections. Controls are disabled for Archived scope, Deleted,
or when no matching task needs that completion change. Direct requests also
preserve archived and deleted tasks. Results and project summaries reflect saved
completion immediately, and changes persist across restarts and later moves.
An empty directory result displays No matching tasks. Pages are rendered on the
server after results are resolved, so no empty announcement appears during a
pending result update.

Directory order offers Original, Priority, Due date, and Title, starting at Original
on each new opening. Priority puts High before Normal before Low; Due date orders
calendar dates ascending before undated tasks; Title compares literal titles by
Unicode code point after folding only ASCII uppercase letters. Ties retain the
original project/task order. This view selection survives filtering, search,
range validation, and bulk completion actions without writing task positions or
changing project pages, exports, or remembered return order.

The directory summary shows completed tasks out of all tasks in the current
resolved result, including retained completion flags in Deleted views and tasks
in Archived scope. It follows all applied filters, search, due range, and bulk
actions; changing Directory order leaves the counts unchanged. Empty results
show `0/0 completed` alongside No matching tasks. Project summaries continue
to count only their own live tasks.

The directory also lists each owner represented in the resolved result, once per
project ID in project creation order. Each owner's summary counts only its matching
tasks, and the owner totals add up to the global directory summary. Duplicate
project names remain separate rows; task sorting does not reorder these owners.
Open project resets that project's view filters, including for archived owners.
Empty results show no owners. This list never writes project or task data.

Delete visible tasks marks matching live tasks deleted in Active scope; Restore
visible tasks restores matching tasks only in the Active scope's Deleted filter.
Both actions resolve all applied filters in one transaction and retain directory
ordering and controls. Rows, owner totals, global totals, and project live-task
summaries reflect the saved result. Archived scope, incompatible task filters,
and empty results disable the corresponding controls and direct requests cannot
change protected records. Deletion changes only the deletion flag, preserving
all fields, ownership, stored order, and remembered return positions across restarts.

Visible tasks priority offers Low, Normal, and High, initially Normal on each new
directory visit. Set visible priority updates only matching live tasks in Active
scope, resolving the current completion, priority, due range, and title search
filters in one transaction. The chosen bulk priority and other directory controls
are retained; membership, ordering, owner totals, and action eligibility refresh
from the saved result. Archived scope, Deleted, and empty live results disable
the action. Direct requests with missing or invalid priorities change no tasks.
Only task priority changes; all other fields, project defaults, ownership, and
remembered ordering remain intact through restarts and later moves.
