# Workboard

Requires Node.js 22.22.1. No package installation is needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0` and exposes
`GET /health`. `PORT` defaults to `8080`; `DB_PATH` defaults to
`./data/workboard.sqlite`. Keep the database file to retain projects, tasks and completion state across
restarts, including archive state.

The project list starts with Active projects. Use Project filter to view Archived
projects and restore them. Each row shows completed and total task counts.
Each task has a saved Low, Normal, or High priority, initially Normal. Changing
priority preserves its title, completion state and position. Archived project
pages allow task filtering but disable task creation, completion, renaming and
priority changes. Restoring a project enables editing with saved values intact.
Task filter and Priority filter work together, initially selecting All. Changes
to completion or priority immediately update the matching rows while preserving
both filter selections. Project summaries always count every task.

Tasks can also save or clear a calendar due date. Due from and Due through
apply an inclusive date range together with Task filter and Priority filter.
Either boundary may be blank; a range with any boundary excludes undated tasks.
Invalid ranges leave the previous applied range intact. Editing a task updates
matching rows, and opening a project starts with an empty range. Archived
projects allow all filters while keeping saved task data read-only.

Move task sends a task to another active project, preserving its title,
completion, priority and due date. First arrivals append after all positions
established in the destination; returning tasks recover their remembered
position in that project, even across restarts. New tasks also follow established
positions, including those reserved for tasks currently elsewhere. The source
page keeps all selected filters. Archived projects cannot send or receive tasks;
moving is disabled when no active destination is available.

Run the integration checks:

```sh
npm test
```

Tests use a temporary database outside the repository and remove it afterward.
