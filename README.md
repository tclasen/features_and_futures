# Workboard

Requires Node.js 22.22.1. No dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Visit http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`. The configured SQLite file preserves projects,
tasks, completion state, renamed project and task titles, task priorities, per-project
new-task priority defaults, optional task due dates, multiline plain-text notes, task ownership and remembered order in each visited project,
task deletion state, and project archive state across restarts. Deleted tasks retain all fields
and reserved positions; the Deleted filter supports reading and restoration while live
filters and completion summaries exclude them. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration tests cover project and task validation, trimming, ordered rows,
detail navigation, task filtering and ownership, completion updates, HTML escaping,
health, archive/restore, completion summaries, migration of existing databases,
project and task renaming with stable identity, ownership, completion, and archived-project protection,
priority defaults and migration, independent priority edits, combined completion/priority
filtering, retained filter selections through edits, project default priority migration
and inheritance without changing existing tasks, Gregorian due-date validation and clearing,
due-date migration and independence, inclusive due-range filtering intersecting completion
and priority, range validation and retention across edits, moves between active projects with
first-arrival append ordering, restored per-project return positions (including reverse-order returns),
preserved task data, destination eligibility, archive protection, project and task substring
search with ASCII-only case folding and space/tab-run normalization (without changing saved text),
search/filter intersections and retention through edits,
empty search on reopening, notes migration and exact text preservation, notes movement and archive restrictions,
reversible deletion, live-only summaries, deleted filter intersections, disabled editing,
restoration into reserved positions, deletion migration, and persistence across server restarts. Test databases are
created beneath `data/` and removed afterward.
