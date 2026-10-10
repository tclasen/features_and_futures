# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file
to preserve projects, archive state, tasks, and completion state across server
restarts. Existing databases are migrated automatically. Each project supports
task creation, completion, and All/Open/Completed filters. The project list has
Active/Archived filters and completion summaries. Archive projects to make their
tasks read-only; restore them from the Archived list to resume editing.
Active project pages also support renaming. Names are trimmed and required;
renaming preserves the project's URL, position, tasks, and completion state.
Archived projects cannot be renamed until restored. Renamed project names
persist in the same SQLite database.
Each active task row supports renaming with a trimmed, required title. Task
renaming preserves ownership, creation order, completion, and filter membership.
Archived task rename controls are disabled until the project is restored.
Each task has a saved Low, Normal, or High priority, defaulting to Normal for
new and existing tasks. Priority changes preserve task order, ownership, title,
and completion. Archived priority controls are disabled until restoration.
Project pages also have an All/Low/Normal/High priority filter. Both task filters
apply together and keep their selections through completion, priority, and rename
edits. Filters remain usable on archived projects and never change saved tasks
or completion summaries. Opening a project from the list starts with both
filters set to All.
`GET /health` returns
`{"status":"ok"}`.

Run the integration checks, including a server restart using a temporary SQLite
database:

```sh
npm test
```
