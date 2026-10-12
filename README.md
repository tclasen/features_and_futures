# Workboard

Requires Node.js 22.22.1. No dependencies need to be installed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. Configure the port and persistent
SQLite database location with environment variables:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Each project page lets you create tasks,
toggle completion, and filter by All, Open, or Completed. The project list shows
completion summaries and filters Active or Archived projects. Archive and restore
buttons preserve project tasks; archived project pages allow viewing and filtering
tasks with creation and completion disabled. Projects, archive state, and tasks
persist in the configured SQLite database, including when upgrading an existing
database. `GET /health` returns `{"status":"ok"}`.

Active project pages also let you rename a project. Names are trimmed and must
not be blank. Renaming preserves the project URL, list position, and tasks;
archived projects must be restored before they can be renamed.

Each task row also lets you rename its task with a trimmed, nonblank title.
Renaming preserves ownership, creation order, completion, and summaries, and
updates the completion checkbox label. Archived tasks must be restored with their
project before they can be renamed.

Each task has a Task priority selector with Low, Normal, and High options.
Existing tasks default to Normal. Priorities persist independently across
renames and restarts; archived projects disable priority edits until restored.

Run the integration checks with `npm test`.

Project pages also offer a Priority filter with All, Low, Normal, and High options.
Tasks must match both the completion and priority filters and retain creation
order. Both selections stay in place during task edits, which immediately update
the matching rows. Opening a project from the list starts both filters at All.
Filters remain usable while archived and never change completion summaries.

Each project has a Default task priority selector with Low, Normal, and High
options, initially Normal. New tasks inherit that project's saved default;
changing the default leaves existing tasks and both filter selections unchanged.
Defaults persist independently across renames and restarts. Archived projects
display their saved default with editing disabled until restored.
