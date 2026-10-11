# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The server binds to `0.0.0.0`. Keep the database file to preserve projects, archive state, tasks, and completion state across restarts. Existing databases are migrated automatically. Parent directories are created automatically.

Create projects on the home page, then open a project to create tasks and toggle completion. Use New project name and Rename project to rename an active project. Names are trimmed and required; renaming preserves the URL, creation order, tasks, and completion summary and persists across restarts. The Task filter shows All, Open, or Completed tasks. The Priority filter offers All, Low, Normal, and High. Both default to All on each page load; tasks matching both filters appear in creation order. Changing either filter or editing a task preserves both selections and immediately re-evaluates matching rows, without changing the project summary. Both filters remain available in archived projects.

Each task row provides New task title and Rename task. Titles are trimmed and required; renaming preserves ownership, creation order, completion, filter membership, and the project summary. Task titles persist across restarts. Each task has a Task priority selector with Low, Normal, and High options. Existing tasks default to Normal; new tasks inherit their project's saved Default task priority (initially Normal). The default selector offers Low, Normal, and High and affects only future tasks. Defaults are independent per project and persist through reloads, restarts, renaming, archival, and restoration. Changing a default leaves existing tasks and both filters unchanged. Archived projects display the saved default but disable edits until restored. Task priority edits persist independently without changing task order, title, completion, or summaries. Renaming preserves priority. Archived projects disable task renaming and priority edits until restored.

Each task row also has Task due date and Save due date controls. Save a real Gregorian date in YYYY-MM-DD format (years 0001–9999), or save an empty/whitespace-only value to clear it. Surrounding whitespace is trimmed. Invalid dates display an alert and leave the saved date unchanged. Dates are calendar days without timezone conversion, persist independently across restarts, and survive renaming, archival, and restoration. Saving a date preserves both filters and all other task data. Archived projects disable date editing until restored.

Each project page has Due from and Due through textboxes and Apply due range. Valid, trimmed YYYY-MM-DD boundaries are inclusive and intersect the completion and priority filters. Blank boundaries are unbounded; when either is present, undated tasks are excluded. Invalid dates or reversed boundaries show an alert and preserve the last applied range. Task edits immediately re-evaluate membership; renaming, creation, and default changes preserve all applied filters. Range controls remain usable on archived projects. Opening or reloading a project starts with empty boundaries and All in both task filters. Filtering is local to the page and never changes saved task data or all-task summaries.

The Project filter defaults to Active. Archive projects to move them to Archived, or restore them without losing tasks. Archived project pages are read-only, but task filtering remains available. Each project row summarizes completed tasks out of all tasks.

`GET /health` returns `{"status":"ok"}`.

Run automated tests (HTTP/SQLite integration including restart persistence, and browser-controller tests using a minimal DOM adapter):

```sh
npm test
```
