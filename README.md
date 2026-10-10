# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step are needed.

Run `npm start` to listen on `0.0.0.0:8080`. Set `PORT` to change the port and
`DB_PATH` to select the persistent SQLite file (default: `./data/workboard.sqlite`).
The database directory is created automatically. Retain this file across restarts.

Example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.
On a project page, create tasks, toggle completion, and filter by All, Open, or
Completed. Tasks belong to their project and retain their saved state on restart.
The project list defaults to Active; switch Project filter to Archived to open or
restore archived projects. Archiving preserves tasks and makes task creation and
completion read-only until restoration. Each row summarizes all completed tasks.
Existing databases are migrated automatically without changing project or task IDs.
Active project pages also support renaming. Names are trimmed; renaming preserves
the project URL, list order, tasks, and summary. Archived projects cannot be renamed
until restored.
Each task row supports renaming with a trimmed title. Renaming preserves task
ownership, order, completion, and summaries, and updates its completion label.
Archived projects disable task renaming until restored.
Run `npm test` for HTTP integration tests, including persistence across separate
server processes. Tests use temporary databases and clean them up afterward.
