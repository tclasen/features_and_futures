# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step are needed.

```sh
npm start
```

The server binds to `0.0.0.0` using `PORT` (default `8080`). SQLite data is stored
at `DB_PATH` (default `data/workboard.sqlite`); keep this file to preserve projects and tasks
across restarts. Parent directories are created automatically.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm test
npm run check
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. The application uses
server-rendered HTML and standard browser forms. Project names are trimmed on
creation and escaped for display; project IDs provide stable URLs.
Each project owns its tasks. Task titles are trimmed and escaped for display.
Completion changes are saved immediately; the All, Open, and Completed filters
retain creation order. The selected filter is stored in the project page URL.

The project list initially shows Active projects; choose Archived to open or
restore archived projects. Archiving preserves tasks and completion state but
disables task creation and completion changes, including direct POST requests.
Each project summary counts all its tasks regardless of task filters. Existing
SQLite databases are migrated automatically, with existing projects initially
active. Archive state and task data persist across restarts.

Active projects can be renamed from their project page. Names are trimmed and
must not be blank. Renaming preserves the project ID, URL, creation order, tasks,
and completion summary. Archived projects cannot be renamed until restored;
this restriction also applies to direct POST requests. Renamed names persist
across restarts.
