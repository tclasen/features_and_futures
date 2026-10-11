# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step are needed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`) and the SQLite file
at `DB_PATH` (default `data/workboard.sqlite`). The database directory is created
automatically. Keep this file to preserve projects, tasks, completion state, and
archive state across restarts. Existing databases are migrated automatically.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. Projects are created through
the home page and can be opened individually. Blank names are rejected; names
are trimmed and displayed safely as text. Each project has its own tasks, with
completion checkboxes and an All/Open/Completed filter. Blank task titles are
rejected and titles are trimmed. Pages use standard HTML forms; JavaScript
submits completion and filter changes automatically. Project URLs work on reload.
The project list starts with Active projects and can show Archived projects.
Archiving makes a project's tasks read-only; restoring permits edits again.
Each project row shows the completed count out of all its tasks.
Active projects can be renamed with surrounding whitespace trimmed. Blank names
are rejected. Renaming preserves the project's URL, list position, tasks, and
completion state, and the new name persists across restarts. Archived projects
cannot be renamed until restored.
Each task can also be renamed within its row. New titles are trimmed and blank
titles are rejected. Renaming preserves task order, ownership, completion state,
and filter membership. Task rename controls are disabled while the project is
archived, and renamed titles persist across restarts.
