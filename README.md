# Workboard

A project and task board built with Node.js 22.22.1, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript. No external dependencies or installation step are needed.

Run:

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to choose the persistent SQLite file (default `data/workboard.sqlite`):

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080/`. `GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
```

Each project has a saved default task priority. New tasks inherit that default; changing it leaves existing tasks unchanged. Archived projects display the default but cannot edit it.

Tasks can have an optional due date. Save a real Gregorian date in `YYYY-MM-DD` format (years `0001` through `9999`), or save a blank value to clear it. Dates are stored as calendar days without timezone conversion. Archived projects display saved dates but cannot edit them.

Use `Due from` and `Due through` to apply an inclusive due-date range alongside completion and priority filters. Blank boundaries are unbounded; undated tasks match only when both boundaries are blank. Invalid ranges leave the applied range unchanged. Edits retain all three filters, and reopening a project from the list resets them. Range filtering remains available in archived projects.

Use each task's `Destination project` selection and `Move task` button to move it to another active project. Destinations appear in project creation order. Moving to a project for the first time appends the task after all positions established there. Returning to a previous project restores its remembered position, even when multiple tasks return in a different order. Each project’s positions persist across restarts. Moves preserve the current title, completion, priority and due date. The source stays open with its filters unchanged, and both project summaries update. Archived projects cannot send or receive tasks; move controls are disabled when no eligible destination exists. Existing task order migrates automatically from earlier databases; project renaming, archival and restoration preserve remembered positions.

The integration tests start the actual server with temporary databases, check project and task validation, ordering, navigation, completion, filtering, project isolation, archive/restore, read-only archived tasks, completion summaries, project and task renaming, independent task priorities, combined priority/completion filtering with selections retained during edits, project defaults for new tasks, optional due dates including leap years and invalid dates, inclusive due ranges, and task moves including append order, preserved data, filters, summaries and archive restrictions. They also verify migration from earlier schemas and restart the process to check persistence. Temporary files are removed after the tests.

Use `Project search` / `Search projects` and `Task search` / `Search tasks` to apply name or title substring searches. Searches ignore ASCII letter case and trim surrounding query whitespace while preserving internal whitespace. Project search intersects the active/archived filter. Task search intersects completion, priority and applied due-date range filters; edits and moves preserve the applied query and filters. Search remains available in archived projects and never changes saved data or all-task summaries. Opening a project from the list or returning through `Projects` starts with an empty query.
