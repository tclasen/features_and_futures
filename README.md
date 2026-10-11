# Workboard

Requires Node.js 22.22.1. No application dependencies are needed.

```sh
npm start
```

The server listens on `0.0.0.0:8080` by default. Set `PORT` and `DB_PATH` to configure the port and persistent SQLite file:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Visit `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Within a project, create tasks, check or uncheck completion, and use Task filter
to show All, Open, or Completed tasks. Projects, tasks, and completion persist in
the configured SQLite file across restarts.

Use Project filter to view Active or Archived projects. Archive and restore
projects from their rows; summaries count all completed and total tasks.
Archived project pages allow viewing and filtering tasks, with creation and
completion controls disabled. Existing databases are upgraded automatically.

On an active project page, use New project name and Rename project to change
its name while preserving its URL, creation order, tasks, and summary. Archived
projects must be restored before renaming.

Each task row provides New task title and Rename task. Renaming preserves task
order, project ownership, completion, and summary counts, and updates the
completion checkbox label. Archived projects must be restored before task
renaming is enabled.

Each task has a Task priority selector with Low, Normal, and High options.
Existing tasks retain their priorities; new tasks inherit their project's
default. Priorities persist independently of task titles and completion; archived projects disable priority changes until
restored.

Use Priority filter to show All, Low, Normal, or High priorities together with
Task filter. Tasks must match both filters and keep their creation order.
Completion and priority edits immediately refresh the matching rows while
preserving both filter selections. Both filters work in archived projects;
filtering leaves saved tasks and completion summaries unchanged.

Each project has a Default task priority selector with Low, Normal, and High
options, initially Normal. Changes apply only to subsequently created tasks in
that project and preserve both task filters. Defaults persist across restarts,
renaming, archival, and restoration; archived projects disable the selector.

Run the integration checks with `npm test`.
