# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite modules with no external dependencies.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Create a project and open it to create tasks, toggle completion, and filter by All, Open, or Completed. The project list shows completion summaries and filters Active or Archived projects. Archive projects to make their tasks read-only; restore them to resume editing. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the database file to preserve projects, tasks, completion, and archive state across restarts. Existing databases are upgraded automatically. `GET /health` returns `{"status":"ok"}`.

On an active project page, use New project name and Rename project to update its name. Names are trimmed and cannot be blank. Renaming preserves the URL, creation order, tasks, and completion summary. Archived projects disable renaming until restored. Renamed names persist in the same SQLite database.

Each task row has New task title and Rename task controls. Task renames trim whitespace and reject blank titles, preserving ownership, creation order, completion, filters, and project summaries. The completion checkbox label follows the saved title. Archived projects disable task renaming until restored; titles persist across reloads and restarts.

Each task also has a Task priority selector with Low, Normal, and High options. Existing tasks default to Normal. Priorities persist independently across reloads, restarts, and renames; archived projects disable priority edits until restored.

Default task priority on each project page offers Low, Normal, and High. Existing and new projects start with Normal. Changes save independently for each project and apply only to tasks created afterward, leaving existing tasks and both filters unchanged. Defaults survive reloads, restarts, renaming, archival, and restoration. Archived projects show their saved default with the selector disabled.

The Priority filter offers All, Low, Normal, and High and starts at All when opening a project. It combines with Task filter to show tasks matching both selections in creation order. Editing completion or priority immediately updates the matching rows without resetting either filter. Renames preserve both selections. Filters remain usable in archived projects and do not change saved data or completion summaries.

Each task row has a Task due date textbox and Save due date button. Save a real Gregorian date in YYYY-MM-DD format (years 0001–9999), or leave it blank to clear it. Surrounding whitespace is trimmed. Invalid dates show an alert and preserve the saved date. Dates persist independently without timezone conversion and leave other task data, filters, and summaries unchanged. Archived projects disable both date controls until restored.

Due from and Due through accept the same calendar-date format. Apply due range intersects inclusive boundaries with both task filters. A blank boundary is unbounded; both blank include undated tasks, while any boundary excludes them. Invalid or reversed ranges show an alert and retain the previous applied range. Task edits immediately update matching rows; renames, creation, and default changes retain the applied range and selected filters. Range controls remain usable in archived projects. Reopening a project resets the range fields to empty. Filtering never changes saved tasks or completion summaries.

Run the integration checks:

```sh
npm test
```

Tests use a temporary SQLite database and verify schema migration, validation, creation order, project isolation, completion updates, archive/restore, summaries, the page and asset routes, and persistence across server restarts.
Tests also cover project and task renaming, unchanged identity and completion state, rejection of archived renames, and renaming after restoration.
UI event-handler checks use a minimal DOM adapter to verify validation, checkbox names, completion changes, filters, summaries, renaming, and archived controls without external dependencies.
Priority checks cover migration of existing tasks, independent saved values, invalid input, filters, renames, archived controls, restoration, and server restarts.
Default-priority checks cover project migration, independent defaults, inheritance by new tasks only, unchanged existing tasks and filters, failed-save recovery, archived controls, restoration, and restart persistence.

Due-date checks cover schema migration, calendar and leap-year validation, trimming and clearing, independent dates, unchanged task data and summaries, rename preservation, filters, archived controls, restoration, and restart persistence.

Due-range UI checks cover inclusive and one-sided boundaries, undated tasks, calendar validation, reversed ranges, combined filters, immediate updates after edits, preserved selections, archived controls, and reset on reopening. The HTTP checks also verify the shared calendar-validation module is served.

Each task row offers Destination project and Move task. Destinations are other active projects in project creation order, using their current names. Moving appends the task after the destination's existing tasks and preserves its title, completion, priority, and due date. The source page stays open with all selected filters and its applied due range retained. Both projects' summaries reflect their current tasks. Archived projects cannot send or receive tasks; controls are also disabled when there are no eligible destinations. Moves and task order persist across reloads and restarts.

Move checks cover upgrading existing databases, append order, subsequent creation and repeated moves, independent task data, ownership validation, active-project restrictions, summary updates, restart persistence, destination options, source filter retention, and failed-move recovery.

Project search and Search projects filter project names by substring alongside Active/Archived. Task search and Search tasks filter titles alongside completion, priority, and the applied due range. Searches trim surrounding query whitespace and ignore ASCII letter case, preserving internal whitespace. Blank queries match all rows allowed by the other filters. Search queries remain applied during filtering and editing, including task moves, and reset when opening either page. Search remains available for archived projects and never changes stored data or summary counts.

Search checks cover combined filters, creation order, whitespace and ASCII matching, unapplied drafts, clearing queries, archive/restore, preserved summaries, edits and moves under search, and resets on reopening.
