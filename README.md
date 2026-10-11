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

The integration tests use temporary databases and verify validation, ordering, project isolation, completion updates and counts, archive/restore and rename protections, rename identity preservation, task priority validation and isolation, detail routes, health, database migration, and persistence across server-process restarts. Dependency-free DOM tests exercise combined filters and task editing event handlers.

The Project filter defaults to Active; choose Archived to open or restore archived projects. Each project row shows completed/total task counts. Archived project pages show tasks and allow filtering, but cannot create tasks, rename tasks, change priorities, or change completion.

Use New project name and Rename project on an active project page to change its name without changing its URL, order, or tasks. Archived projects cannot be renamed until restored.

On an active project page, create tasks, toggle their completion checkboxes, and choose All, Open, or Completed in the Task filter. The filter defaults to All on page load. Priority filter offers All, Low, Normal, and High, initially All. Both filters apply together and retain their selections when changing the other filter or editing a task. Matching tasks stay in creation order; project summaries always count all tasks. Both filters remain usable in archived projects.

Each task row provides New task title and Rename task. Renames trim whitespace and preserve ownership, creation order, completion, filter membership, and summary counts. Empty titles show an alert without changing the task. Restore an archived project to enable task renaming again.

Each task row has a Task priority selector with Low, Normal, and High options. Migrated tasks default to Normal. New tasks inherit their project's saved Default task priority, initially Normal. Priorities are saved independently and preserved by renaming, completion changes, and archive/restore. Archived projects disable priority editing.

Default task priority offers Low, Normal, and High on each project page. Changing it saves only that project's default for future tasks; existing tasks, summary counts, and both filter selections remain unchanged. The default survives renaming, restarts, archival, and restoration. Archived projects display it in a disabled selector.

Due from and Due through textboxes apply an inclusive calendar-date range with Apply due range. Blank boundaries are unbounded; both blank include undated tasks, while either boundary excludes them. The range intersects completion and priority filters, remains applied through task edits and creation, and resets when reopening the page. Invalid dates or reversed boundaries show an alert and preserve the previous applied range. Range controls remain usable in archived projects.

Each task row has a Task due date textbox and Save due date button. Enter a real Gregorian date in YYYY-MM-DD format (years 0001–9999), or leave it blank to clear the date. Surrounding whitespace is trimmed. Invalid dates show an alert and leave saved data unchanged. Dates are calendar days with no timezone conversion, persist independently, and survive other task edits. Archived projects disable both due-date controls.
