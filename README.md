# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite with no external dependencies.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to select the persistent SQLite file (default `data/workboard.sqlite`). For example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and browse projects, view completion summaries, and archive or restore projects. Open an active project to rename it, create or rename tasks, toggle completion, choose each task's Low, Normal, or High priority, and combine the All/Open/Completed task filter with the All/Low/Normal/High priority filter. Both filters initially select All. Edits immediately update matching rows without resetting either filter; summaries always count every task. Existing tasks retain their priorities. Each project initially defaults to Normal for new tasks; its Default task priority selection saves Low, Normal, or High for subsequent tasks without changing existing tasks or either filter. Defaults belong to each project independently and survive renaming, archival, restoration, and restarts. Archived projects allow viewing and filtering tasks, with renaming, default priority, and task changes disabled. Renaming preserves identity, position, completion, and priority. Each task has an optional Task due date: Save due date accepts real Gregorian dates in YYYY-MM-DD format (years 0001–9999), trims whitespace, and clears the date for blank input. Invalid dates show an alert and preserve the saved date. Archived projects disable due-date editing; restoring preserves dates. Date edits preserve both filters and all other task data. All changes persist across server restarts. `GET /health` returns `{"status":"ok"}`.

Run the HTTP and persistence checks with:

```sh
npm test
```
