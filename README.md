# Workboard

Requires Node.js 22.22.1. Uses only built-in Node modules; no installation is needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. `PORT` defaults to
`8080`; `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file
to preserve projects, archive state, tasks, and completion state across restarts.

Open a project to create tasks, toggle their completion checkboxes, and choose
All, Open, or Completed in the Task filter. Tasks belong to their project and
appear in creation order. The Priority filter offers All, Low, Normal, and High;
only tasks matching both filters and the applied due range appear. Opening a project starts both filters
at All. Filter selections stay in place when either filter changes or a task is
edited; changing completion or priority immediately updates the matching rows.
Both filters work while archived, and project summaries always count all tasks.

Use New project name and Rename project on an active project page to rename it.
Names are trimmed and must not be blank. Renaming preserves the project's URL,
creation order, tasks, and completion state, and persists across restarts.
Archived projects cannot be renamed until restored.

Each task row has New task title and Rename task controls. Task titles are
trimmed and must not be blank. Renaming preserves ownership, creation order,
completion state, filter membership, and project summaries across restarts.
Task renaming is disabled while the project is archived and enabled on restore.

Each task has a Task priority selector with Low, Normal, and High options.
Existing tasks default to Normal. Priority changes persist across
restarts and preserve task titles, completion, ordering, ownership, and summaries.
Archived projects disable priority changes; restoring enables them again.

Each project has a Default task priority selector with Low, Normal, and High
options, initially Normal. New tasks inherit the project's saved default.
Changing it preserves existing tasks, both filter selections, and summaries.
Defaults are independent per project and persist through renaming, restarts,
archival, and restoration. Archived projects show a disabled default selector.

Each task has a Task due date textbox and Save due date button. Dates are optional:
save an empty value to clear one, or enter a real Gregorian date in YYYY-MM-DD
format with a year from 0001 to 9999. Surrounding whitespace is trimmed. Invalid
dates show an alert and preserve the saved date. Dates persist without timezone
conversion and leave other task data, filters, and summaries unchanged. Archived
projects disable due-date edits until restored.

Use Due from, Due through, and Apply due range for inclusive calendar-date
filtering. Either boundary can be blank; with any boundary, undated tasks are
excluded. Clearing both boundaries includes undated tasks again. Invalid dates
or reversed boundaries show an alert and preserve the previous applied range.
The range intersects completion and priority filters, stays applied across edits
and filter changes, and works in archived projects. Reopening a project from the
list starts with empty boundaries. Summaries continue to count all tasks.

The Project filter starts with Active projects. Archive a project to move it to
Archived, or restore it to return it to Active. Each project shows its completed
and total task counts. Archived projects remain readable with working task
filters; task creation and completion changes are disabled until restoration.
Existing database files are migrated automatically, preserving their data.

Each task row has a Destination project selector and Move task button. Select
another active project to move the task after its existing tasks, preserving
the task's title, completion, priority, and optional due date. Moving keeps the
source page open with its filters and applied due range. Both summaries update
to reflect ownership. Destinations use current project names in project
creation order. Moving is disabled when no destination is eligible or the source
is archived. Moves and task order persist across restarts.

Health check:

```sh
curl http://localhost:8080/health
```

Verification:

```sh
npm test
```

The integration tests start real server processes, use temporary SQLite
databases, and check project and task validation, ordering, navigation, HTML
escaping, task filtering and ownership, completion changes, and persistence
after restarts, legacy database migration, archive/restore, summaries, and
archived-project mutation protection, and project and task renaming with identity
and data preservation, task priorities including migration and persistence, and
combined completion/priority filtering with edits and archive/restore, and
project default priorities with migration, inheritance, and persistence, and
optional due dates with calendar validation, clearing, migration, independence,
filter preservation, and persistence through archive/restore and restarts, plus
inclusive due-range intersections, validation, and preservation across edits,
and task moves with migrated ordering, filter and data preservation, active
destination validation, summaries, repeat moves, and restart persistence.
