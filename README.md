# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite, with no external dependencies.

Start:

```sh
npm start
```

The server binds to `0.0.0.0` on port `8080` by default. Configure the port and persistent database file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects, view completion summaries, and switch between Active and Archived projects. Archive or restore projects from their rows. Archived project pages retain task filtering while disabling task creation and completion changes. Each active project supports task creation, completion checkboxes, and All/Open/Completed/Deleted filters. Projects, archive state, and tasks persist in the configured SQLite file. Existing databases are upgraded automatically. `GET /health` returns `{"status":"ok"}`.

Active project pages also support renaming with `New project name` and `Rename project`. Names are trimmed and required. Renaming preserves the project URL, list position, tasks, and completion summary. Archived projects must be restored before renaming. Renamed names persist across server restarts.

Each task row provides `New task title` and `Rename task`. Titles are trimmed and required. Renaming updates the visible title and completion checkbox label while preserving ownership, creation order, completion state, filter membership, and project summaries. Archived projects disable task renaming; restoration enables it again. Renamed task titles persist across server restarts.

Each project page has a `Priority filter` with All/Low/Normal/High options. It combines with the All/Open/Completed/Deleted task filter, preserving creation order. Both selections stay in place through task edits, including edits that remove a task from the matching rows. Filters also work on archived projects. Summaries count all live tasks. Each task has an independent, persistent Low/Normal/High priority; archived projects disable priority edits.

`Default task priority` sets the priority inherited by subsequent tasks in that project. Existing and new projects initially use Normal. Changing the default preserves existing tasks and both selected filters. Each project's default persists through reloads, server restarts, renaming, archival, and restoration. Archived projects show the saved default in a disabled combobox.

Each task row has a `Task due date` textbox and `Save due date` button. Dates are optional: blank input clears the saved date. Nonempty input is trimmed and must be a real Gregorian date in `YYYY-MM-DD` format with a year from 0001 through 9999. Invalid input shows an alert and preserves the saved date. Dates persist across restarts without timezone conversion and do not change other task data, selected filters, or summaries. Archived projects disable due-date editing until restored.

Each project page provides `Due from`, `Due through`, and `Apply due range`. Blank boundaries are unbounded; any nonblank boundary excludes undated tasks. Both endpoints are inclusive and use the same Gregorian date validation as task due dates. Invalid ranges show an alert and retain the previously applied range. The range intersects completion and priority filters, stays in place through edits, and remains usable while archived. Opening a project from the list resets the range to empty. Summaries continue to count all live tasks.

Each task row provides `Destination project` and `Move task`. Destinations are other active projects, listed by project creation order with their current names. Moving to a project for the first time appends the task after all established positions. Returning to a previous project restores its remembered position, even when tasks return in a different order. New tasks follow established positions, including those of tasks currently elsewhere. Movement preserves current identity, title, completion, priority, and due date. The source stays open with its selected filters and applied due range. Both summaries reflect current ownership. Moves and task order persist across restarts. Archived projects cannot send or receive tasks; move controls are also disabled when no eligible destination exists.

Project search and task search match substrings using ASCII case-insensitive comparison, trimming query edges and treating each run of ASCII spaces and horizontal tabs as one space in both the query and name/title. This normalization applies only to matching; original saved names and titles remain unchanged. Project search intersects Active/Archived; task search intersects completion, priority, and due-range filters. Applied queries stay in place through filter changes and task edits, and searches remain usable while archived. Opening either page through its navigation button starts with an empty query. Searches leave saved data and all-task summaries unchanged.

Each task row provides a multiline `Task notes` textarea and `Save notes`. Notes preserve whitespace, line breaks, Unicode, and literal markup as plain text. Empty text clears them. Notes persist through reloads, restarts, moves, and return-order restoration without changing other task data or search matching. Saving retains all applied task filters and search. Archived projects display notes with editing disabled; restoration enables editing. Existing databases receive empty notes without changing pre-existing data.

Live tasks provide `Delete task`. Deletion keeps all saved fields and remembered project positions but removes the task from All/Open/Completed and completion summaries. The `Deleted` filter intersects priority, due range, and title search, showing saved fields with editing and movement disabled. `Restore task` returns a task to its reserved position and retains the selected filters. Archived projects disable deletion and restoration while allowing filtering. Deletion persists across restarts; upgrades initialize existing tasks as live.

Run verification:

```sh
npm test
```

The test uses a temporary SQLite file and verifies schema migration, project and task validation, creation order, HTML escaping, navigation, project isolation, completion updates, combined priority and completion filtering, edits under selected filters, project default inheritance and isolation, due-date validation and clearing, inclusive due-range intersections and validation, edits under applied ranges, archive/restore behavior, renaming and identity preservation, task moves, remembered return order, search matching and filter intersections, edits under applied searches, completion summaries, and persistence across server restarts.
