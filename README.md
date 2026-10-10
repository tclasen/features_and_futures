# Workboard

Requires Node.js 22.22.1. Uses JavaScript ES modules, Node's built-in HTTP
server and SQLite, and browser HTML/CSS/JavaScript. No packages need installing.

Start:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH` defaults
to `./data/workboard.sqlite`. Keep the database file to retain projects and tasks across
restarts. The database parent directory is created automatically.

Visit `/` to create and open projects. `GET /health` returns
`{"status":"ok"}`. Names are trimmed and must not be empty; project IDs are
stable and projects appear in creation order.

On a project page, create tasks with trimmed, nonempty titles. Tasks start open;
use their completion checkboxes to save changes. The Task filter defaults to All
and can show Open or Completed tasks. Each project owns its tasks, which appear
in creation order. Task titles and completion states persist across restarts.
Existing project databases are extended automatically when the server starts.

The Project filter starts at Active and can show Archived projects. Archive a
project from its row, or restore it from the Archived list. Archived projects
remain accessible with task filtering, but task creation and completion changes
are disabled. The server also rejects these changes for archived projects.
Restoring preserves all tasks and completion states. Every project row shows
the completed/total task count, including all tasks regardless of filtering.
Archive state persists in SQLite; existing databases migrate automatically.

Use New project name and Rename project on an active project page to rename it.
Names are trimmed and must not be empty. Renaming preserves the project's URL,
creation order, tasks, and completion summary, and persists across restarts.
Archived projects cannot be renamed; restoring enables renaming again.
The project API accepts `PATCH /api/projects/:id` with `{ "name": "New name" }`;
send archive changes separately from renames.

Each task row has New task title and Rename task controls. Renaming trims the
title and rejects empty titles, preserving the task's identity, project, order,
completion state, and summary counts. Archived projects disable task renaming;
restoring enables it again. The task API accepts
`PATCH /api/projects/:projectId/tasks/:taskId` with `{ "title": "New title" }`;
send completion changes separately from renames.

Each task has a Task priority selector with Low, Normal, and High options.
Existing tasks default to Normal when migrated from databases without priorities.
Priorities persist independently without
changing task titles, completion, ownership, order, or project summaries. Archived
projects disable priority changes; restoring preserves priorities and enables edits.
Send `{ "priority": "High" }` to the task PATCH endpoint, separately from title
or completion changes. Existing task databases migrate automatically.

The Priority filter starts at All and can show Low, Normal, or High tasks. It
combines with the Task filter: rows must match both selections and retain their
creation order. Changing a filter or editing a task keeps both selections;
completion and priority edits immediately update which rows match. Both filters
remain usable in archived projects. Filtering never changes saved tasks or the
project completion summary.

Each project has a Default task priority selector with Low, Normal, and High
options. Existing and new projects start at Normal. Changing it saves the default
for subsequent task creation; existing tasks and both selected filters stay unchanged.
Defaults are independent per project and survive renaming, archival, restoration,
and restarts. Archived projects display their saved default with editing disabled.
Send `{ "defaultPriority": "High" }` to `PATCH /api/projects/:id`, separately
from rename or archive changes. The server assigns the saved default when creating
a task. Existing project databases migrate automatically without changing tasks.

Each task row has a Task due date textbox and Save due date button. Dates are
optional: saving blank or whitespace-only text clears the saved date. Otherwise,
the server trims and validates a real Gregorian `YYYY-MM-DD` calendar date with
a year from `0001` through `9999`, without timezone conversion. Invalid dates
display an alert and leave saved task data unchanged. Dates persist independently
through renaming, archival, restoration, and restarts. Saving a date preserves
both filters and all other task fields. Archived projects disable these controls.
Send `{ "dueDate": "2026-10-10" }` (or `{ "dueDate": "" }` to clear) to the task
PATCH endpoint, separately from title, completion, or priority changes. Existing
databases migrate automatically with empty due dates.

Run tests:

```sh
npm test
```

Tests use a temporary database outside the repository and check validation,
creation order, the health endpoint, detail routes, project isolation, completion
validation, archive/restore protections, completion summaries, migration from
existing databases, renaming, priorities and their read-only protections, and restart
persistence for projects and tasks, project default inheritance, independent defaults,
and migration of existing saved priorities.
Due date tests cover calendar boundaries and leap-year rules, invalid input,
trimming and clearing, independent task dates, migration, archived protections,
and preservation of task data and summaries across restarts.
Filter tests cover every completion/priority combination, creation order,
unchanged source data, and membership after task edits.
