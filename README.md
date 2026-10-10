# Workboard

Requires Node.js 22.22.1. No installation or external dependencies needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`; the server binds to `0.0.0.0`. Keep the configured database file to preserve projects, tasks, and completion state across restarts. Open a project to create tasks, toggle completion, or filter All/Open/Completed.

Use the Project filter to switch between Active and Archived projects. Archive or restore projects from their rows; summaries count all completed tasks. Archived project pages allow viewing and filtering tasks but not creating or completing them. Archive state persists in SQLite, and existing databases are migrated automatically.

On active project pages, use New project name and Rename project to rename without changing the URL, order, or tasks. Names are trimmed and cannot be blank. Archived projects cannot be renamed until restored. Renamed names persist across restarts.

Each task row provides New task title and Rename task. Titles are trimmed and cannot be blank. Renaming preserves task order, ownership and completion; archived projects disable task renaming until restored. Titles persist across restarts.

Each task has a Task priority selector with Low, Normal, and High options. Existing tasks default to Normal when migrating older databases. Priorities persist independently across reloads and restarts, survive renames, and cannot be edited while the project is archived.

Priority filter offers All, Low, Normal, and High alongside Task filter. Both filters apply together, retain their selections during task edits, and remain usable for archived projects. Summaries always count all tasks.

Default task priority on each project page saves a per-project Low, Normal, or High default (initially Normal). Only subsequently created tasks inherit it; existing tasks and both filter selections remain unchanged. Defaults survive renaming and restarts, and are disabled while archived and preserved on restoration.

Each task row has a Task due date textbox and Save due date button. Enter a real calendar date in `YYYY-MM-DD` format (years 0001–9999), or leave it blank to clear it. Dates are trimmed, saved independently without timezone conversion, and preserved across renames and restarts. Invalid dates show an alert without changing saved data. Archived projects disable due-date editing until restored.

Health: `GET /health` returns `{"status":"ok"}`.

Run the isolated integration tests (including process-restart persistence):

```sh
npm test
```
