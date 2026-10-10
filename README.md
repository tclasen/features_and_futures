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

Run the integration checks:

```sh
npm test
```

Tests use a temporary SQLite database and verify schema migration, validation, creation order, project isolation, completion updates, archive/restore, summaries, the page and asset routes, and persistence across server restarts.
Tests also cover project and task renaming, unchanged identity and completion state, rejection of archived renames, and renaming after restoration.
UI event-handler checks use a minimal DOM adapter to verify validation, checkbox names, completion changes, filters, summaries, renaming, and archived controls without external dependencies.
Priority checks cover migration of existing tasks, independent saved values, invalid input, filters, renames, archived controls, restoration, and server restarts.
Default-priority checks cover project migration, independent defaults, inheritance by new tasks only, unchanged existing tasks and filters, failed-save recovery, archived controls, restoration, and restart persistence.
