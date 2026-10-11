# Workboard

Requires Node.js 22.22.1. No dependencies need installation.

Start with `npm start`. The server binds to `0.0.0.0` on `PORT` (default `8080`).
Set `DB_PATH` to select a persistent SQLite file (default `data/workboard.sqlite`).

Example: `PORT=8080 DB_PATH=data/workboard.sqlite npm start`

Run verification with `npm test`.

Create projects on the home page and open a project to create tasks. Task titles
are trimmed, tasks start open, and the Task filter shows All, Open, or Completed
tasks in creation order. Completion changes and project ownership are stored in
the configured SQLite file and survive restarts.

Projects can be archived and restored from the project list, which shows each
project's completion summary. Archived projects keep their tasks and allow
filtering, but task creation, completion changes, and renaming are disabled.
Use New project name and Rename project on an active project page to rename it.
Names are trimmed and required; renaming preserves the URL, creation order,
tasks, and completion summary and persists across restarts.

Each task row provides New task title and Rename task. Renaming trims and
requires a title while preserving ownership, order, completion, and summaries.
Task renaming persists across restarts and is disabled in archived projects.

Task priority is saved independently for each task and can
be changed to Low or High. Archived projects disable priority edits.
The Priority filter (All, Low, Normal, High) combines with the Task filter;
both initially show All and remain usable in archived projects. Matching tasks
keep their creation order. Edits immediately update matching rows while keeping
both filter selections, and project summaries always count every task.

Default task priority on each project page selects Low, Normal, or High for
subsequent new tasks. Projects initially default to Normal. Changing the default
preserves existing tasks and both filter selections. Defaults are independent
per project, persist across restarts, renaming, archive and restore, and cannot
be edited while the project is archived.

Each task has an optional Task due date, saved with Save due date. Dates must be
real Gregorian calendar dates in YYYY-MM-DD format (years 0001–9999). Surrounding
whitespace is trimmed; an empty value clears the date. Invalid dates show an
alert and leave saved data unchanged. Dates persist across restarts and task
renames without changing filters or summaries. Archived projects disable date
editing; restoration preserves dates and enables editing again.
