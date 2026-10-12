# Workboard

Requires Node.js 22.22.1; no external dependencies.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The server binds to `0.0.0.0`. Keep the SQLite file to preserve projects, renamed project names, archive state, tasks, renamed task titles, priorities, project defaults for new task priorities, completion state, and optional task due dates across restarts. Existing databases are migrated automatically.

Health: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests exercise project and task validation, ordering, escaped rendering, navigation, filtering and ownership, completion updates, archive/restore, project and task renaming with identity preservation, read-only archived projects, summaries, independent task priorities, combined priority/completion filters with selection preservation through edits, independent project priority defaults affecting only future tasks, strict Gregorian due-date validation and clearing, schema migration, health, and persistence across server restarts using isolated SQLite databases that are removed afterward.
