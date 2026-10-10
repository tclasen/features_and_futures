# Workboard

A dependency-free project board using Node.js 22.22.1, built-in HTTP, and SQLite.

## Run

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. To configure the port and persistent database:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Each project supports task creation, completion checkboxes, and combined All/Open/Completed and All/Low/Normal/High filtering. Both filter selections survive task edits, and matching tasks retain creation order. Filters remain usable while archived. The project list filters Active/Archived projects and shows completion summaries. Rename active projects without changing their URL, order, or tasks. Rename tasks without changing their ownership, order, completion, or filter membership. Each task has an independent Low/Normal/High priority, saved across reloads and restarts. Each project's Default task priority starts at Normal; changing it affects only subsequently created tasks and preserves both task filters. Project defaults persist independently through renaming, archival, restoration, and restarts; archived defaults are disabled. Each task also has an optional saved due date: enter a real Gregorian YYYY-MM-DD date (years 0001–9999), or save an empty value to clear it. Invalid dates leave saved data unchanged. Due-date edits preserve filters and other task state, persist through restarts, and are disabled while archived. Archive and restore projects without losing tasks; archived project pages are read-only, including rename and priority controls. Projects, tasks, and archive state persist in SQLite, including databases from earlier checkpoints. `GET /health` returns `{"status":"ok"}`.

Due from and Due through apply an inclusive date range intersecting completion and priority filters. Blank boundaries are unbounded; undated tasks match only when both boundaries are blank. Invalid dates or reversed boundaries show an alert and retain the previous applied range. The range survives all project/task edits and filter changes, works while archived, and resets when reopening a project from the list. Summaries always count all tasks.

Each task can be moved to another active project using Destination project and Move task. Destinations use current names in project creation order. First-time arrivals append after all positions established in the destination. Returning tasks recover their previous ordering position in that project, even when several tasks return in a different order. Moves preserve current task data, update both summaries, and keep the source page and its filters open. Archived projects cannot send or receive tasks; move controls are also disabled when no eligible destination exists. Task ordering, remembered per-project positions, and ownership persist across restarts.

Project search and Task search apply trimmed substring queries with ASCII-only case-insensitive matching. For matching only, runs of ASCII spaces and horizontal tabs in queries and names/titles become one space; stored and displayed text remains unchanged. Searches intersect their page's existing filters and preserve creation/remembered task order. Task edits retain the applied query and all filters, re-evaluating membership immediately. Search works in archived projects without enabling editing. Opening the list or returning through Projects resets project search; opening a project from the list resets task search. Searches never alter saved data or all-task summaries.

## Verify

```sh
npm test
```

Tests use temporary databases and verify validation, creation order, safe rendering, project navigation, health, task ownership, completion, filtering, archive/restore, read-only archived projects, completion summaries, project and task rename validation and identity preservation, priority defaults and independent edits, all combined filter combinations, filter selection preservation and re-evaluation after edits, project priority default inheritance and isolation, due-date calendar validation, clearing, isolation and archived controls, database migration, and persistence across server restarts. Range tests cover inclusive and single-sided boundaries, all completion/priority intersections, invalid applications, edit-driven membership changes, archived filtering, and reset on reopening. Move tests cover legacy ordering migration, destination eligibility and naming, append order, preserved data and source filters, summaries, repeated moves, archive restrictions, no-destination controls, reverse-order returns, reserved positions while tasks are away, independent positions across three projects, Task 011 ordering migration, and restart persistence. Search tests cover ASCII case rules, normalized spaces/tabs without changing saved text, significant newlines, blank queries, filter intersections, preserved search across edits and moves, invalid range applications, archived controls, safe rendering, fresh-navigation resets, and restart persistence.
