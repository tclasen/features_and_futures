# Workboard

Requires Node.js 22.22.1. No packages need to be installed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). Set `DB_PATH`
to the SQLite file to retain projects, archive state, their tasks, and completion state across
restarts; the default is `data/workboard.sqlite`. Its parent directory is created automatically.
`GET /health` returns `{"status":"ok"}`.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

Tests use temporary databases outside the repository and remove them afterward.

The project list starts with Active projects; switch Project filter to Archived to
open or restore an archived project. Archived project tasks can be viewed and
filtered, but creation and completion changes are disabled. Completion summaries
count every task in each project. Existing databases are migrated automatically.
