# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port `8080` and database path
`data/workboard.sqlite`. The server binds to `0.0.0.0`; keep the database file
to preserve project names and IDs, tasks, completion state, priorities, project default priorities, due dates, notes, deletion state, remembered task positions, and archive state across restarts.
Existing databases are upgraded automatically. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration tests use temporary SQLite databases and verify project and task
creation, blank-input validation, ordering, HTML escaping, project navigation,
task ownership, completion changes, filtering, health, and persistence across
process restarts, archive/restore, read-only archived projects, completion summaries,
migration from the previous schema, and project/task renaming with identity,
order, ownership, and completion preservation and archived-project protection.
Priority tests cover migration defaults, independent saved values, exact options,
filter and summary preservation, rename preservation, and archive/restore protection.
Combined-filter tests cover all completion/priority combinations, creation order,
selection preservation through edits and validation, immediate matching-row changes,
and saved task state across restarts and archive/restore. Both filters remain usable
on archived project pages.
Project-default tests cover schema migration, independent defaults, new-task inheritance,
unchanged existing tasks and filters, validation, renaming, restart persistence,
and archive/restore protection.
Due-date tests cover empty defaults and migration, strict Gregorian calendar validation,
trimming and clearing, independent values, unchanged filters and summaries, rename preservation,
restart persistence, and archive/restore protection.
Due-range tests cover inclusive and one-sided boundaries, undated tasks, intersections
with completion and priority filters, invalid-range preservation, edit-driven membership
changes, restart persistence of task data, and usable archived filtering. Applied ranges
are kept in the project URL; opening a project from the list starts with empty boundaries.
Task-move tests cover ordered active destinations, disabled controls without destinations,
source ownership and archived protection, first-arrival append ordering and remembered
return positions (including reverse-order returns), unchanged task data and source filters,
summaries, schema migration, and restart persistence.
Moves preserve task identity and all saved attributes, independently of destination defaults.
Each project remembers task positions even while tasks are elsewhere; new tasks and first
arrivals follow all previously established positions. Migration preserves current task order.
Project and task searches use trimmed, ASCII-case-insensitive substrings, collapsing
runs of ASCII spaces and horizontal tabs in queries and names/titles for matching only.
They intersect all existing filters without changing saved text, data or summary counts. Applied queries
are retained through filtering and edits; list/project navigation starts with empty queries.
Search tests cover space/tab normalization, original-text preservation, non-ASCII
case and whitespace sensitivity, HTML/URL escaping,
filter intersections, edit-driven membership, validation, movement and return order,
archived searching, and restart persistence of task data.
Task notes preserve multiline plain text exactly, travel with tasks, and are read-only
in archived projects. Notes do not affect title search.
Deleted tasks appear only under the fourth Task filter option, `Deleted`, intersecting
the same priority, due-range and title-search filters. They are excluded from summaries
and cannot be edited or moved until restored. Deletion reserves their project positions;
restoration preserves all saved fields and returns them to those positions. Archived
projects allow reading deleted tasks but not deleting or restoring them. Tests cover
migration to live tasks, filter preservation, summary changes, disabled controls,
server-side edit protection, restoration order, movement and restart persistence.
Every project page offers `Download project`, including archived projects. It downloads
`workboard-project.json` with portable version-1 project state and all live/deleted tasks
in stored order, regardless of filters. Notes line endings are exported as LF without
changing stored notes. Export tests cover legacy defaults, empty projects, movement and
return ordering, exact text, deletion, archived access, unchanged data and restart behavior.
The home page provides `Project JSON`, `Imported project name`, and `Import project`.
Import validates the complete version-1 document before atomically creating an independent
project with the trimmed override name. It preserves supplied task order and state,
normalizes notes line endings to LF, and ignores additional internal identity fields.
Invalid documents and blank override names leave all data unchanged and retain the inputs.
Import tests cover required fields and types, Gregorian dates, late-task validation failures,
archived/deleted behavior, independent identities, restoration and return order, empty projects,
and restart persistence.
