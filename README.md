# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

```sh
npm start
```

The server binds to `0.0.0.0`, with `PORT` defaulting to `8080` and `DB_PATH` defaulting to `data/workboard.sqlite`. The database directory is created automatically. Use a persistent filesystem path to retain projects, tasks, completion state, and archive state between restarts.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The browser UI uses HTML forms. Task completion and filter changes submit automatically with browser JavaScript; fallback submit buttons are available without JavaScript. Project names and task titles are trimmed on creation and escaped when displayed. Projects appear in creation order. Tasks appear in project-local order. First-time arrivals append; returning tasks recover their remembered position in that project. Each project owns its tasks; the All (default), Open, and Completed filters only show that project's tasks.

The project list defaults to Active; select Archived to open or restore archived projects. Every project row summarizes all tasks as completed/total. Archived projects keep their tasks and filters, but task creation and completion changes are disabled and rejected by the server. Existing SQLite databases are automatically migrated without changing project or task IDs.

Active project pages also support renaming. Names are trimmed and must be nonblank; renaming keeps the URL, creation order, tasks, and summary unchanged. Archived projects cannot be renamed until restored. Renamed names persist in the same SQLite database.

Each task row also supports renaming with a trimmed, nonblank title. Renaming preserves task identity, project ownership, order, completion, and filter membership, and updates the completion label. Archived projects disable and reject task renaming until restored.

Each task has an independent Low, Normal, or High priority. Priority changes save automatically and preserve task order, ownership, title, completion, and summaries. Archived projects disable and reject priority changes until restored. Existing tasks migrate to Normal; saved priorities survive renaming and server restarts.

Project pages combine the Task filter with a Priority filter (All, Low, Normal, High). Both default to All when opening a project. Each change submits both selections, and task edits preserve them while immediately re-evaluating matching rows in creation order. Filters remain usable on archived projects and never change saved task data or completion summaries.

Each project has a saved Default task priority (Low, Normal, High), initially Normal for both existing and new projects. Changes affect only tasks created afterward in that project, preserve both filters, and never update existing tasks. Defaults survive renaming, reloads, and restarts. Archived projects display the saved default but disable and reject edits until restored.

Every task has an optional Task due date textbox and Save due date button. Dates are trimmed and validated as real Gregorian calendar days in `YYYY-MM-DD` format (years 0001–9999), without timezone conversion. Empty input clears the date; invalid input displays an alert and preserves the saved date. Dates persist independently without affecting task data, filters, or summaries. Archived projects disable and reject due-date edits until restored.

Project pages also provide Due from and Due through textboxes and Apply due range. Boundaries use the same calendar-date validation and are inclusive; blank boundaries are unbounded. Undated tasks match only when both boundaries are blank. Applied ranges intersect completion and priority filters, survive edits and filter changes, and remain usable in archived projects. Invalid applications show an alert without replacing the previous range. Ranges are view state carried in URLs and forms, not saved task data; opening a project from the list starts with empty boundaries.

Each task row has a Destination project combobox and Move task button. Destinations are other active projects in project creation order, using their current names. Moving preserves task identity, title, completion, priority, and due date without applying the destination's default priority. First-time arrivals append after all positions established in the destination, including temporarily absent tasks. Returning tasks recover their previous position relative to other tasks, regardless of return order. The source stays open with all filters retained; summaries reflect current ownership. Moves are disabled when no eligible destination exists and in archived projects, and the server validates both projects and task ownership atomically. A persistent per-task, per-project position table remembers order across moves, renaming, archival and restarts. Migration seeds each current task's existing position without changing current order. Task creation and movement update current ownership and remembered positions in transactions.

Project search and Task search apply trimmed substring queries with ASCII-only case folding. For matching only, runs of ASCII spaces and horizontal tabs in queries and names/titles collapse to one space; other internal whitespace remains significant. Stored and displayed names/titles retain their original internal whitespace and case. Searches intersect their respective filters and preserve creation/project-local order. Applied queries travel in URLs and forms, survive edits and other filter changes, and never affect stored data or all-task summaries. Archived views support search. Opening the list through Projects or a project through Open project starts a fresh view with an empty query.

The tests use temporary SQLite databases and real HTTP requests, including server restarts to check persistence, task filtering, completion toggles, validation, project isolation, archive/restore, summaries, renaming, priorities, combined filters, project defaults, due-date validation and persistence, inclusive due ranges, moves and project-local ordering, migration from previous schemas, and search matching and view-state retention.
