# Workboard

Projects and tasks application using Node.js 22.22.1, built-in HTTP and SQLite, and server-rendered HTML/CSS. No dependencies or install step are needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file to retain projects, tasks, completion state, and archive state across restarts. Existing databases are upgraded automatically.

Open a project to create tasks, toggle completion, and filter by All, Open, or Completed. Combine this with the Priority filter (All, Low, Normal, High); tasks must match both filters and retain creation order. Both selections survive task edits, which immediately re-evaluate matching rows. Filters remain usable when archived and never change saved data or completion summaries. Project rows show completed/total counts. Use the Active/Archived project filter to archive or restore projects. Active project pages also support renaming with `New project name` and `Rename project`. Renaming preserves the URL, creation order, tasks, and summaries. Each task row supports `New task title` and `Rename task`, preserving task ownership, order, and completion. Both project and task renaming trim whitespace and reject blank names or titles. Each task also has a `Task priority` selector with Low, Normal, and High options. Existing tasks default to Normal; changes persist independently and renaming preserves priority. Each project has a saved `Default task priority` (Low, Normal, High), initially Normal. New tasks inherit that project's current default; changing it never changes existing tasks or filter selections. Defaults survive renaming, reloads, restarts, archival and restoration. Each task has an optional `Task due date` textbox and `Save due date` button. Saving trims whitespace and accepts only real Gregorian dates in YYYY-MM-DD format (years 0001–9999); an empty value clears the date. Invalid dates display an alert without changing saved data. Dates persist independently, without timezone conversion, and edits preserve both task filters and all other task data. Archived projects retain their tasks but cannot rename projects or tasks, create tasks, or change completion, priority, due dates, or the project default until restored.

Health: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use temporary databases and check labels, validation, trimming, ordering, safe rendering, navigation, health, task ownership, completion, filters, archive/restore, read-only enforcement, database migration, summaries, renaming with stable identity and ordering, persistent task priorities with migration and independent updates, combined completion/priority filters with preserved selections and immediate re-evaluation, project default migration, independent inheritance, archive protection, optional due-date migration, calendar validation, clearing, task independence and archive protection, and persistence across server restarts.
