# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to
the SQLite file to use; the default is `data/workboard.sqlite`. Parent
directories are created automatically. Keep this file across restarts to
preserve project names, IDs, tasks, completion state, and archive state.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. Projects are created with trimmed,
nonempty names and displayed in creation order. Project pages use persistent
IDs at `/projects/<id>`. Each project has tasks with trimmed, nonempty titles,
saved completion state, and All/Open/Completed filters in creation order.
Small browser event handlers submit filter and checkbox changes using forms.
The project list defaults to Active and also offers Archived projects. Archive
and restore preserve all tasks. Archived project pages allow task filtering,
but task creation and completion changes are disabled and rejected by the server.
Project summaries count all tasks, regardless of task filters. Existing databases
are migrated automatically with all previous projects remaining active.
Active project pages also support renaming with trimmed, nonempty names. Renaming
preserves the project URL, creation order, tasks, and completion summary. Archived
projects disable rename controls and reject rename requests until restored.
