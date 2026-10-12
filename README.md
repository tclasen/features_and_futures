# Workboard

Requires Node.js 22.22.1; no external dependencies.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The server binds to `0.0.0.0`. Keep the SQLite file to preserve projects, renamed project names, archive state, tasks, renamed task titles, priorities, project defaults for new task priorities, completion state, and optional task due dates across restarts. Existing databases are migrated automatically.

Health: `GET /health` returns `{"status":"ok"}`.

Project pages provide inclusive `Due from` / `Due through` filtering, intersected with completion and priority filters. Empty boundaries are unbounded; undated tasks match only when both are empty. Applied ranges are preserved through edits and reset when opening a project from the list.

Task rows provide `Destination project` and `Move task` controls for moving to another active project. Moves preserve task data. First arrivals append after all established positions; returning tasks recover their remembered position in that project, even when other tasks return in a different order. Source filters stay selected. Archived projects cannot send or receive tasks. Task ownership and per-project ordering persist across restarts.

Project and task search match name/title substrings, ignoring ASCII letter case, trimming surrounding query whitespace, and treating runs of ASCII spaces and horizontal tabs as one space in both queries and names/titles. This normalization is only for matching; saved names and titles are displayed unchanged. Search intersects the applicable filters and remains applied through filter changes and edits. Returning to the project list or reopening a project resets that page's search. Archived projects support search without enabling editing.

## Verify

```sh
npm test
```

Tests exercise project and task validation, ordering, escaped rendering, navigation, filtering and ownership, completion updates, archive/restore, project and task renaming with identity preservation, read-only archived projects, summaries, independent task priorities, combined priority/completion filters with selection preservation through edits, independent project priority defaults affecting only future tasks, strict Gregorian due-date validation and clearing, inclusive due-range filtering and validation with preservation through edits, task moves with first-arrival append ordering and persistent return positions, destination eligibility and source-filter preservation, project/task search intersections and state preservation, schema migration, health, and persistence across server restarts using isolated SQLite databases that are removed afterward.
