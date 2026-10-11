# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; defaults are port
8080 and database `data/workboard.sqlite`. Use the same `DB_PATH` across restarts
to preserve projects, task titles, priorities, due dates, project priority defaults, completion state, archive state, task ownership/order, and remembered positions in previous projects. Existing databases
are migrated automatically. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use an isolated temporary SQLite database and check project creation,
blank-name alerts, name trimming/escaping, ordering, navigation markup,
health, task validation and completion, project isolation, filtering, and
persistence across server restarts, archive/restore, read-only archived tasks,
completion summaries, migration from the previous database schema, and project
and task renaming with stable identity, validation, persistence, and archived
restrictions. Priority checks cover Normal defaults for migrated and new tasks,
independent edits, validation, ownership, rename preservation, restart persistence,
and archive/restore restrictions. Combined-filter checks cover every completion/priority
combination, selection preservation, immediate re-filtering after edits, unchanged
summaries, persistence, and usable filters on archived projects. Project-default checks
cover migration, independent saved defaults, future-task inheritance, unchanged existing
tasks and filters, validation, and persistence through renaming and archive/restore.
Due-date checks cover empty defaults and migration, strict Gregorian validation (including
leap years and year boundaries), trimming and clearing, independent ownership, unchanged
filters and summaries, rename preservation, restart persistence, and archive/restore.
Due-range checks cover inclusive and unbounded boundaries, undated tasks, intersections
with completion and priority filters, invalid applications preserving the applied range,
selection retention and immediate re-filtering across edits, and archived filtering.
Project and task searches use trimmed substring queries with ASCII-only case folding.
Search intersects existing filters, preserves internal whitespace, and remains applied
through edits. Search controls work in archived projects. Returning through Projects
resets project search; reopening a project from the list resets task search, all task
filters and due-range boundaries. Search tests cover these rules, filter intersections,
edit re-evaluation, movement, unchanged summaries, and navigation resets.
Move checks cover active destination options, disabled controls, source ownership validation,
first-arrival append ordering (including migrated tasks and subsequent creations), preserved task data,
source filter retention, updated summaries, repeat moves, and restart persistence.
Returning tasks recover their remembered position in each project; new tasks append after
all established positions, including those of tasks currently away. Tests cover reverse-order
returns across restarts, project renaming, archive/restore, and preservation of current task fields.
