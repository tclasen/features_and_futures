# Workboard

A project and task application using Node.js 22.22.1, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript. No dependencies or installation are required.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. Defaults are port `8080` and database `data/workboard.sqlite`. Keep the database file to preserve projects, tasks, completion state, project names, task titles, task priorities, project default priorities, due dates, and archive state across restarts. Existing databases migrate automatically.

Health: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration tests use temporary databases and verify validation, ordering, project isolation, completion updates and counts, archive/restore and rename protections, rename identity preservation, task priority validation and isolation, detail routes, health, database migration, task moves, and persistence across server-process restarts. Dependency-free DOM tests exercise combined filters, project/task search, task editing, and move event handlers.

Project search and Search projects apply a name substring query alongside the active/archived filter. Task search and Search tasks apply a title substring query alongside completion, priority, and due-range filters. Searches ignore ASCII letter case, trim surrounding query whitespace, and treat each run of ASCII spaces and horizontal tabs as one space in both the query and name/title. This matching-only normalization never changes stored or displayed names and titles. Blank queries match all rows allowed by the other filters. Applied queries remain through filter changes and edits; reopening a project or returning to Projects starts with an empty query. Search remains usable in archived projects and never changes saved data or summary counts.

The Project filter defaults to Active; choose Archived to open or restore archived projects. Each project row shows completed/total task counts. Archived project pages show tasks and allow filtering, but cannot create tasks, rename tasks, change priorities, or change completion.

Use New project name and Rename project on an active project page to change its name without changing its URL, order, or tasks. Archived projects cannot be renamed until restored.

On an active project page, create tasks, toggle their completion checkboxes, and choose All, Open, Completed, or Deleted in the Task filter. The filter defaults to All on page load. Priority filter offers All, Low, Normal, and High, initially All. Both filters apply together and retain their selections when changing the other filter or editing a task. Matching tasks stay in creation order; project summaries always count all live tasks. Both filters remain usable in archived projects.

Live tasks provide Delete task. Deleted tasks appear only under the Deleted filter, intersecting priority, due range, and title search as usual. Deleted tasks do not count in project summaries. Restore task returns a task to its reserved position with every field intact, even after new tasks are created or project defaults change. Deleted rows display all saved fields with editing and movement disabled. Archived projects disable deletion and restoration but keep filters usable. Deletion and remembered positions persist across restarts; existing tasks migrate as live.

Each task row provides Task notes and Save notes for optional multiline plain text. Saving preserves exact whitespace, Unicode, and literal markup; empty text clears notes. Notes persist and travel with tasks without adding search matches. Archived and deleted rows disable notes editing.

Each task row provides New task title and Rename task. Renames trim whitespace and preserve ownership, creation order, completion, filter membership, and summary counts. Empty titles show an alert without changing the task. Restore an archived project to enable task renaming again.

Each task row has a Task priority selector with Low, Normal, and High options. Migrated tasks default to Normal. New tasks inherit their project's saved Default task priority, initially Normal. Priorities are saved independently and preserved by renaming, completion changes, and archive/restore. Archived projects disable priority editing.

Default task priority offers Low, Normal, and High on each project page. Changing it saves only that project's default for future tasks; existing tasks, summary counts, and both filter selections remain unchanged. The default survives renaming, restarts, archival, and restoration. Archived projects display it in a disabled selector.

Due from and Due through textboxes apply an inclusive calendar-date range with Apply due range. Blank boundaries are unbounded; both blank include undated tasks, while either boundary excludes them. The range intersects completion and priority filters, remains applied through task edits and creation, and resets when reopening the page. Invalid dates or reversed boundaries show an alert and preserve the previous applied range. Range controls remain usable in archived projects.

Each task row provides Destination project and Move task controls. Destinations list other active projects in project creation order. Moving to a project for the first time appends after all positions established there, including positions reserved for absent tasks. Returning to a previous project restores the task's remembered position relative to other tasks, even when multiple tasks return in a different order. Moves preserve current identity, title, completion, priority, and due date; both summaries update accordingly. The source stays open with all filters retained. Archived projects cannot send or receive tasks, and move controls are disabled when no eligible destination exists. Task order, ownership, and per-project remembered positions persist across restarts. Existing databases retain their current task order on migration.

Each task row has a Task due date textbox and Save due date button. Enter a real Gregorian date in YYYY-MM-DD format (years 0001–9999), or leave it blank to clear the date. Surrounding whitespace is trimmed. Invalid dates show an alert and leave saved data unchanged. Dates are calendar days with no timezone conversion, persist independently, and survive other task edits. Archived projects disable both due-date controls.
