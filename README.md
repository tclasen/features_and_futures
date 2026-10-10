# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

```sh
npm start
```

The server binds to `0.0.0.0`, with `PORT` defaulting to `8080` and `DB_PATH` defaulting to `data/workboard.sqlite`. The database directory is created automatically. Use a persistent filesystem path to retain projects, tasks, completion state, and archive state between restarts.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The browser UI uses HTML forms. Task completion and filter changes submit automatically with browser JavaScript; fallback submit buttons are available without JavaScript. Project names and task titles are trimmed on creation and escaped when displayed. Projects and tasks appear in insertion order. Each project owns its tasks; the All (default), Open, and Completed filters only show that project's tasks.

The project list defaults to Active; select Archived to open or restore archived projects. Every project row summarizes all tasks as completed/total. Archived projects keep their tasks and filters, but task creation and completion changes are disabled and rejected by the server. Existing SQLite databases are automatically migrated without changing project or task IDs.

Active project pages also support renaming. Names are trimmed and must be nonblank; renaming keeps the URL, creation order, tasks, and summary unchanged. Archived projects cannot be renamed until restored. Renamed names persist in the same SQLite database.

Each task row also supports renaming with a trimmed, nonblank title. Renaming preserves task identity, project ownership, order, completion, and filter membership, and updates the completion label. Archived projects disable and reject task renaming until restored.

The tests use temporary SQLite databases and real HTTP requests, including server restarts to check persistence, task filtering, completion toggles, validation, project isolation, archive/restore, summaries, renaming, and migration from the previous schema.
