# Workboard

Requires Node.js 22.22.1. No dependencies or installation step.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). Set `DB_PATH` to the SQLite file to retain projects, archive state, tasks, and completion state across restarts; the default is `data/workboard.sqlite`. Parent directories are created automatically.

Example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Visit `/` to create or open projects, view completion summaries, and archive or restore projects. The project filter starts at Active. Each active project page supports renaming (with the same ID, order, and tasks), task creation and renaming, completion checkboxes, and All/Open/Completed filtering (initially All). Names are trimmed and required; renamed projects and tasks persist across restarts. Each task has a saved Low/Normal/High priority. Each project has a saved Default task priority (initially Normal) that applies only to subsequently created tasks. Changing the default preserves existing tasks and both selected filters; archived projects display it disabled, and restoration enables it again. Priority edits preserve ownership, creation order, completion, and summaries; task renaming preserves priority. The Priority filter (All/Low/Normal/High, initially All) combines with the completion filter. Edits immediately update matching rows without resetting either filter; summaries always count all tasks. Each task also has an optional Task due date, saved with Save due date. Dates are trimmed calendar days in YYYY-MM-DD format (years 0001–9999); invalid dates leave the saved value unchanged, and blank input clears it. Due dates persist independently without changing task filters, priorities, completion, or summaries. Due from and Due through apply an inclusive date range that intersects completion and priority filters. Blank bounds are unbounded; with either bound present, undated tasks are excluded. Invalid ranges show an alert and leave the previous applied range intact. Task edits immediately re-evaluate membership without resetting filters; reopening a project resets the range to empty. Archived projects are read-only (including due-date editing controls), but all filters, including the due range, remain usable. Each task row offers Destination project and Move task. Destinations are other active projects in project creation order. Moving appends the task to the destination without changing its identity, title, completion, priority or due date, and keeps the source page's filters intact. Both project summaries reflect their current tasks. Open pages refresh saved state every half-second and on focus so transfers appear in already-open destinations without resetting filters. Destination selections survive task-row updates. Moving is disabled for archived sources and when no eligible destination exists; archived destinations are excluded. Saved per-project task order survives moves and restarts. Existing SQLite databases are upgraded automatically without losing data. `GET /health` returns `{"status":"ok"}`.

Run the integration tests (including process restart persistence):

```sh
npm test
```
