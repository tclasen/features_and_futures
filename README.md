# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite with no external dependencies.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Both variables are optional and default to the values above. The server binds to `0.0.0.0`. SQLite stores projects, tasks, completion state, and archive state across restarts. Existing databases migrate automatically. Open a project to create tasks, toggle completion, or filter by All, Open, and Completed. Use the Project filter to view Active or Archived projects. Archive or restore a project from its row; archived project tasks remain readable and filterable, with editing disabled. Each row shows completed and total task counts. `GET /health` returns `{"status":"ok"}`.

Run the integration checks:

```sh
npm test
```

On an active project page, enter a New project name and select Rename project. Names are trimmed and saved without changing the project URL, creation order, tasks, or completion counts. Blank names show an alert. Archived projects cannot be renamed until restored.

Each task row provides New task title and Rename task controls. Task titles are trimmed and saved while preserving ownership, creation order, completion state, filter membership, and completion counts. Blank titles show an alert. Archived projects disable task renaming until restored.

Each task row also has a Task priority selector with Low, Normal, and High options. Existing tasks default to Normal during migration. Priority changes save independently without changing task order, completion, or summaries; renaming preserves priority. Archived projects disable priority editing until restored. Priorities persist across reloads and server restarts.

Each project has a Default task priority selector with Low, Normal, and High options, initially Normal. New tasks inherit the project's saved default. Changing it preserves existing tasks and both task filter selections. Defaults are independent per project and persist through renaming, restarts, archival, and restoration. Archived projects display the saved default with editing disabled.

Each task has a Task due date textbox and Save due date button. Dates are optional; blank input clears them. Nonempty input is trimmed and must be a real Gregorian date in YYYY-MM-DD format, with a year from 0001 through 9999. Invalid dates show an alert and leave the saved date unchanged. Dates persist without timezone conversion, independently of other task data and both filter selections. Archived projects disable due-date editing until restored.

Each project page provides Due from and Due through textboxes and Apply due range. Boundaries are inclusive, optional, trimmed, and validated using the same calendar rules as task due dates. Any nonblank boundary excludes undated tasks. The applied range intersects completion and priority filters, retains their selections, and remains applied through edits and validation errors. Invalid or reversed ranges show an alert and preserve the previous membership. Range controls remain usable when archived. Opening a project from the list resets all task filters and range boundaries. Filtering never changes saved tasks or all-task completion summaries.

Each task row has a Destination project selector and Move task button. Destinations are active projects other than the current project, listed by project creation order using their current names. A first-time move appends the task after all positions already established in the destination. Returning to a previous project restores its remembered position relative to other tasks, even when multiple tasks return in a different order. Each project's position history persists independently, while the task keeps its current ID, title, completion, priority, and due date. The source stays open with its filters and due range retained; both projects' summaries reflect their current tasks. Archived projects cannot send or receive tasks. Moving is disabled when no eligible destination exists. Saved task order migrates automatically and persists through repeated moves and restarts.

Tests start isolated server processes and remove their temporary database directories after checking validation, creation order, navigation, task filters, project isolation, restart persistence, database migration, archive/restore, editing protection, completion summaries, renaming, and moves with preserved task data, first-time append order, and remembered return positions across projects and restarts.

Project search and Search projects match a trimmed substring of project names, ignoring ASCII letter case while preserving internal whitespace. Search intersects the Active/Archived filter, and changing that filter retains the applied query. Opening the list or returning via Projects starts with an empty query.

Task search and Search tasks use the same matching rules and intersect completion, priority, and applied due-range filters. Search, filter changes, task edits, creation, movement, project renaming, and default-priority changes retain the other applied view settings and re-evaluate matching rows without changing saved task data or summaries. Task search remains usable in archived projects. Opening a project from the list resets its search. Integration checks cover search matching, filter intersections, edit retention, archive restrictions, saved data, and remembered movement order across restart.
