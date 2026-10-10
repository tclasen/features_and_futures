# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step is needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; `PORT` defaults to
`8080`, and `DB_PATH` defaults to `data/workboard.sqlite`. The SQLite file stores
project names and IDs, project tasks, and task completion across restarts.
Open a project to create tasks, check or uncheck completion, and filter by All,
Open, or Completed. `GET /health` returns `{"status":"ok"}`.
The project list filters Active and Archived projects and shows each project's
completed/total task count. Archive and restore projects from their rows.
Archived projects retain their tasks and filters while task creation and
completion changes are disabled. Archive state also persists across restarts;
existing databases are upgraded automatically.
Active project pages also allow renaming with `New project name` and
`Rename project`. Names are trimmed and must not be blank. Renaming preserves
the project's URL, list position, tasks, and completion counts across restarts.
Archived projects cannot be renamed until restored.

Run the integration checks:

```sh
npm test
```
