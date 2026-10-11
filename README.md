# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. Defaults: port `8080`, database `data/workboard.sqlite`. Keep the configured SQLite file to preserve projects, tasks, completion state, and archive state across restarts. Existing databases are migrated automatically.

Open `/` to create and open projects, view completion summaries, and filter Active or Archived projects. Archive or restore projects from their rows. Each active project page lets you rename the project, create and rename tasks, toggle completion, set each task's priority to Low, Normal, or High, and combine the Task filter (All, Open, or Completed) with the Priority filter (All, Low, Normal, or High). Both selections remain unchanged through task edits; visible rows immediately match both filters in creation order, while summaries always count all tasks. Each project's Default task priority starts at Normal and can be set to Low, Normal, or High. New tasks inherit that project's saved default; changing it leaves existing tasks and both filters unchanged. Defaults and task priorities persist independently through renaming and restarts. Project renaming preserves the project URL, creation order, and tasks. Task renaming trims the title and preserves ownership, creation order, completion, and summaries. Each task also has an optional Task due date textbox and Save due date button. Saving trims the value and accepts real Gregorian dates in YYYY-MM-DD format (years 0001–9999); an empty value clears it. Invalid dates show an alert without changing saved data. Dates persist independently without timezone conversion or changes to filters, summaries, or other task data. Archived project pages keep tasks visible and filterable but disable renaming, creation, completion changes, task priority edits, default priority edits, and due-date edits. Restoration preserves and re-enables the saved default. `GET /health` returns `{"status":"ok"}`.

Due from and Due through apply an inclusive calendar-date range together with completion and priority filters. Blank boundaries are unbounded; when either boundary is set, undated tasks are excluded. Invalid dates or reversed boundaries show an alert and preserve the applied range. Edits retain all applied filters and immediately re-evaluate matching tasks. The range controls remain usable while archived; reopening from the project list resets the range to empty. Filters never change saved data or all-task summaries.

## Checks

```sh
npm test
node --check server.js
```

Tests use temporary SQLite databases and verify validation, creation order, escaping, navigation markup, health, project isolation, task filters, completion changes, archive/restore, read-only enforcement, completion summaries, database migration, project and task renaming without changing identity or task state, persistent independent task priorities (including migration and archived read-only enforcement), combined priority/completion filters, selection retention and row re-evaluation after edits, project default priority migration, independent defaults and new-task inheritance without changing existing tasks or filters, optional due-date migration, Gregorian validation including leap years and year boundaries, clearing, task isolation, archived read-only enforcement, and persistence across process restarts. Due-range checks cover inclusive and one-sided bounds, undated tasks, combined filters, invalid applications preserving membership, filter retention through edits, archived filtering, and empty ranges on reopening.
