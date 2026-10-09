# Workboard

Requires Node.js 22.22.1. Uses only built-in Node modules; no installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to the
SQLite file to use (default `data/workboard.sqlite`). Its parent directory is
created automatically. Keep this file to preserve projects, tasks, and completion
state across restarts. Existing project databases are upgraded automatically.
`GET /health` returns `{"status":"ok"}`.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm run check
npm test
```

Project creation uses a standard HTML form and server-side validation. Names are
trimmed before storage and escaped when rendered. Projects appear in increasing
creation ID order. Each project owns its tasks, whose titles are also trimmed and
escaped. Task checkboxes save completion in place when changed and remain disabled
until the save finishes. Failed saves restore the previous state and show an alert.
The Task filter immediately shows All, Open, or Completed tasks in creation order,
including while a completion save is pending. Nonmatching rows remain hidden so
switching back to All restores them. Failed saves also restore row visibility.
Filter selection is recorded in the URL for reloads and carried through task
creation on the current page. Project pages initially show All tasks.
Tests use isolated temporary databases and remove them afterward.
