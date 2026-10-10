# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; the defaults are port 8080 and `data/workboard.sqlite`. Retain the configured SQLite file to preserve projects, archive state, their tasks, and task completion across restarts. Existing databases are upgraded automatically.

Health check: `curl http://localhost:8080/health`

Open a project to create tasks, toggle completion, and filter All, Open, or Completed tasks. The project list shows completion summaries and an Active/Archived filter. Archive or restore projects from their rows; archived project pages allow viewing and filtering tasks but not changing them. Active project pages also allow renaming with `New project name` and `Rename project`, preserving the project URL, order, tasks, and summary. Archived projects cannot be renamed until restored. Each task row also offers `New task title` and `Rename task`; renaming preserves ownership, order, completion, and the selected filter. Blank titles are rejected. Archived projects disable task rename controls until restored. Each task has a `Task priority` selector with Low, Normal, and High. Priorities persist independently through renames and restarts; archived projects disable priority changes until restored. The `Priority filter` (All, Low, Normal, High) combines with the completion filter, keeping creation order. Both filters retain their selections during task edits and remain usable for archived projects; summaries always count all tasks. Each project has a saved `Default task priority` (initially Normal). New tasks inherit that project's current default; changing it leaves existing tasks and both filter selections unchanged. Defaults persist through renaming, restarts, archival, and restoration. Archived projects display the saved default with its selector disabled.

Each task has a `Task due date` textbox and `Save due date` button. Save a real Gregorian date in `YYYY-MM-DD` format (years 0001–9999), or leave it blank to clear it. Invalid dates are rejected without changing saved data. Dates persist independently through renames and restarts. Archived projects disable date editing until restored.

Use `Due from`, `Due through`, and `Apply due range` for inclusive date filtering alongside completion and priority. Either boundary may be blank; undated tasks match only when both are blank. Invalid ranges leave the applied range unchanged. Edits, task creation, and renames retain all applied filters. Reopening a project resets its filters, and archived projects still allow filtering.

Each task row has `Destination project` and `Move task` controls. Destinations list other active projects in project creation order. Moving to a project for the first time appends the task after all positions established there. Returning to a previous project restores its remembered position, even when tasks return in a different order. Each project's positions persist independently, including while tasks are away. Moves preserve the task's identity, current title, completion, priority, and due date. The source page stays open with all filters unchanged; summaries reflect current ownership. Archived projects cannot send or receive tasks, and move controls are disabled when no eligible destination exists. Moves and task order survive restarts.

Use `Project search` and `Search projects` to search within the selected Active/Archived list. On a project page, `Task search` and `Search tasks` combine with completion, priority, and due-range filters. Searches match substrings, ignore ASCII letter case, trim surrounding whitespace, and preserve internal whitespace. Blank searches match everything allowed by the other filters. Task edits retain the applied search and other filters; archived tasks remain searchable but read-only. Opening the list or returning with `Projects` resets project search, and opening a project resets task search.

Run automated HTTP, browser-script, and SQLite restart-persistence checks:

```sh
npm test
```
