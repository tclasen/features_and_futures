# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; defaults are port
8080 and database `data/workboard.sqlite`. Use the same `DB_PATH` across restarts
to preserve projects, task titles, priorities, completion state, and archive state. Existing databases
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
summaries, persistence, and usable filters on archived projects.
