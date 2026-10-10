# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite modules with no external dependencies.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Create a project and open it to create tasks, toggle completion, and filter by All, Open, or Completed. The project list shows completion summaries and filters Active or Archived projects. Archive projects to make their tasks read-only; restore them to resume editing. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the database file to preserve projects, tasks, completion, and archive state across restarts. Existing databases are upgraded automatically. `GET /health` returns `{"status":"ok"}`.

On an active project page, use New project name and Rename project to update its name. Names are trimmed and cannot be blank. Renaming preserves the URL, creation order, tasks, and completion summary. Archived projects disable renaming until restored. Renamed names persist in the same SQLite database.

Run the integration checks:

```sh
npm test
```

Tests use a temporary SQLite database and verify schema migration, validation, creation order, project isolation, completion updates, archive/restore, summaries, the page and asset routes, and persistence across server restarts.
Tests also cover renaming, unchanged identity and task state, rejection of archived renames, and renaming after restoration.
UI event-handler checks use a minimal DOM adapter to verify validation, checkbox names, completion changes, filters, summaries, renaming, and archived controls without external dependencies.
