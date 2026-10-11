# Workboard

Requires Node.js 22.22.1. No dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Visit http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`. The configured SQLite file preserves projects,
tasks, completion state, renamed project and task titles, task priorities, and project archive state across restarts. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration tests cover project and task validation, trimming, ordered rows,
detail navigation, task filtering and ownership, completion updates, HTML escaping,
health, archive/restore, completion summaries, migration of existing databases,
project and task renaming with stable identity, ownership, completion, and archived-project protection,
priority defaults and migration, independent priority edits, archive protection, and persistence
across server restarts. Test databases are
created beneath `data/` and removed afterward.
