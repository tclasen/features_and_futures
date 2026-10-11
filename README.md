# Workboard

Requires Node.js 22.22.1. No package installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to the SQLite file to use (default `./data/workboard.sqlite`). Its parent directory is created automatically. Keep this file across server restarts to preserve projects, tasks, completion state, priorities, due dates, project defaults, and archive state. Existing databases are migrated automatically.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The browser provides project creation at `/` and individual project pages at `/projects/<id>`.

Project pages support task creation, saved completion checkboxes, and All/Open/Completed filters. Tasks belong only to their project; filters default to All on each page load.

The Priority filter offers All, Low, Normal, and High. Tasks must match both filters and stay in creation order. Each filter keeps its selection when the other changes or a task is edited. Completion and priority edits immediately update matching rows. Both filters work in archived projects; filtering never changes saved data or completion summaries.

The project list defaults to Active and can show Archived projects. Archive and restore preserve all tasks. Archived project pages allow viewing and filtering tasks while task creation and completion controls are disabled; the server also rejects these changes. Each project row shows completed/total counts across all its tasks.

Active project pages allow renaming with a trimmed, nonempty name. Names persist without changing project URLs, list order, tasks, or summaries. Archived projects cannot be renamed until restored; both the browser controls and server enforce this restriction.

Each task row allows renaming with a trimmed, nonempty title. Renaming preserves ownership, creation order, completion state, filter membership, and project summaries. The completion checkbox label follows the saved title. Archived projects disable task rename controls and reject title updates until restored. Task titles persist across reloads and server restarts.

Each task has a saved Low, Normal, or High priority, defaulting to Normal for existing tasks. New tasks inherit their project’s saved default priority. Priority changes preserve the task's other fields and project summary; renaming preserves priority. Archived projects disable priority controls and reject updates until restored. Priorities persist across reloads and server restarts.

Each project page provides Default task priority with Low, Normal, and High options. Existing and new projects start at Normal. Changing the saved default affects only subsequently created tasks in that project and leaves both task filters unchanged. Archived projects show the saved default in a disabled control and reject updates until restored. Defaults survive renaming, reloads, and server restarts.

Each task row provides Task due date and Save due date. Empty input clears the date; otherwise a trimmed real Gregorian date in YYYY-MM-DD format (years 0001–9999) is required. Invalid dates leave saved data unchanged. Dates persist as calendar days without timezone conversion, independently for each task. Date changes preserve both filters and other task fields. Archived projects disable date controls and reject date updates until restored.

Due from, Due through, and Apply due range filter tasks by inclusive calendar-day boundaries alongside the completion and priority filters. A blank boundary is unbounded; both blank includes undated tasks, while any boundary excludes them. Invalid dates or a reversed range show an alert and preserve the previous applied range. Task edits immediately update matching rows without resetting filters; filters never alter saved data or summaries. Range controls remain usable in archived projects and reset to empty when reopening a project.

Each task row provides Destination project and Move task. Destinations are other active projects in project creation order, displayed by their current names. Moving keeps the source page and its filters open, removes the task from the source, and restores its remembered destination position on return. First-time arrivals and newly created tasks append after all positions established in that project, including positions of tasks currently elsewhere. Task identity, title, completion, priority, and due date remain unchanged; the destination's default applies only to new tasks. Both project summaries reflect their current tasks. Archived projects cannot send or receive tasks, and move controls are disabled when archived or when there are no eligible destinations. Moves and ordering persist across restarts; legacy databases retain their previous task order during migration.
