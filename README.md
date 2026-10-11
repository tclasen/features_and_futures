# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. Defaults are port 8080 and `data/workboard.sqlite`; reuse the database path to retain projects, tasks, completion state, archive state, and renamed project names, task titles, task priorities, project default priorities, and task due dates across restarts. Task notes also persist across restarts. Existing databases are upgraded automatically.

Health check: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests launch isolated servers and temporary SQLite databases, checking project and task creation, validation, ordering, HTML escaping, navigation markup, combined completion/priority filters and selection retention, project isolation, archive/restore, renaming and identity preservation, completion summaries, independent task priorities and project defaults, new-task inheritance, optional due dates and Gregorian validation, inclusive due-range filtering and invalid-range preservation, task moves and destination ordering, archive restrictions, legacy database migration, health, and persistence across process restarts.

On a project page, create tasks, toggle their completion checkboxes, and choose All, Open, Completed, or Deleted in Task filter. Priority filter offers All, Low, Normal, and High; both filters default to All and tasks must match both selections. Filter changes and task edits submit automatically, preserving both selections and creation order. Completion summaries count only live tasks, regardless of filters. Both filters remain usable when archived. The project list defaults to Active; choose Archived to open or restore archived projects. Archived project pages allow task filtering but prevent task creation and completion changes. Each project row shows completed/total task counts. Use New project name and Rename project on active project pages to rename without changing the URL, order, or tasks. Archived projects cannot be renamed until restored. Each task row provides New task title and Rename task controls, preserving task order, ownership, and completion. Archived projects disable task renaming until restored. Each task row has a Task priority selector with Low, Normal, and High options. Existing tasks retain their saved priorities. Each project has a Default task priority selector (Low, Normal, High), initially Normal. Changes save automatically and apply only to subsequent tasks in that project; existing tasks and both filters remain unchanged. Task priority changes save without altering completion or order. Archived projects disable task priority and default priority changes until restored. Each task has a Task due date textbox and Save due date button. Save a real Gregorian date in YYYY-MM-DD format (years 0001–9999), or save an empty value to clear it. Surrounding whitespace is trimmed; invalid dates show an alert without changing saved data. Dates are calendar days without timezone conversion, and archived projects disable date editing until restored.

Use Due from, Due through, and Apply due range to intersect an inclusive date range with the completion and priority filters. Blank boundaries are unbounded; both blank include undated tasks, otherwise undated tasks are excluded. Invalid dates or reversed boundaries show an alert and preserve the previously applied range. All edits retain the applied range and selected filters. Range controls remain usable in archived projects. Opening a project from the list starts with empty boundaries.

Each task row has Destination project and Move task controls. Choose another active project to move the task, preserving title, completion, priority, and due date. First-time arrivals append after all positions established in that project; returning tasks reclaim their remembered position. Positions are remembered independently for every visited project, including while tasks are absent. New tasks append after established positions. Existing databases retain their current task order when upgraded. The source stays open with all filters retained; summaries update for both projects. Moving is disabled for archived sources or when no eligible destination exists. Archived projects never appear as destinations. Ownership and ordering persist across restarts.

Use Project search and Search projects to match names within the selected Active/Archived list. Task search and Search tasks match titles within all selected task filters, including the applied due range. Searches trim surrounding query whitespace and ignore ASCII letter case. For matching only, runs of ASCII spaces and horizontal tabs in queries and names/titles become one space; saved and displayed names/titles stay unchanged. Blank searches match everything allowed by the other filters. Edits and filter changes retain applied searches and re-evaluate membership; summaries still count all live tasks. Search remains available in archived projects. Opening the list or returning through Projects resets project search; opening a project from the list resets task search.

Each task row has a multiline Task notes textarea and Save notes button. Notes save as plain text without trimming, including whitespace, Unicode, and literal markup; saving empty text clears them. Notes start empty, travel with moved tasks, and do not affect searches or other task fields. Saving retains all applied filters and search. Archived projects display notes but disable editing until restored. Database upgrades initialize new notes as empty without changing existing task data.

Live rows offer Delete task. Deleted tasks retain all fields and remembered positions, but are excluded from All, Open, Completed, and project summaries. The Deleted filter intersects priority, due range, and title search; deleted rows are read-only and offer Restore task. Restoration reuses the reserved position and leaves the Deleted filter selected. Deleted tasks cannot be edited or moved until restored. Archived projects permit reading both live and deleted tasks, but disable deletion and restoration. Deletion state persists across restarts; upgrades initialize existing tasks as live.
