# Workboard

Requires Node.js 22.22.1. No package installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to the SQLite file to use (default `./data/workboard.sqlite`). Its parent directory is created automatically. Keep this file across server restarts to preserve projects, tasks, completion state, and archive state. Existing databases are migrated automatically.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The browser provides project creation at `/` and individual project pages at `/projects/<id>`.

Project pages support task creation, saved completion checkboxes, and All/Open/Completed filters. Tasks belong only to their project; filters default to All on each page load.

The project list defaults to Active and can show Archived projects. Archive and restore preserve all tasks. Archived project pages allow viewing and filtering tasks while task creation and completion controls are disabled; the server also rejects these changes. Each project row shows completed/total counts across all its tasks.
