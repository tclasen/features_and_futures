# Workboard

Requires Node.js 22.22.1. No application dependencies or installation step are needed.

Run with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Projects, their tasks,
and task completion persist in that SQLite file. Open a project to create tasks,
toggle their completion, or filter by All, Open, and Completed.
The project list starts with Active projects; switch Project filter to Archived
to open or restore archived projects. Each row summarizes completion across all
tasks. Archived projects retain their tasks and allow filtering, but task creation
and completion changes are disabled until the project is restored. Existing
databases are migrated automatically; projects begin active.
`GET /health` returns `{"status":"ok"}`.

Run the integration check with:

```sh
npm test
```

The check starts the real server using a temporary SQLite file and verifies
validation, creation order, project retrieval, task ownership, completion updates,
archive/restore, completion summaries, existing-database migration, and persistence
after restart.
It removes its temporary files when finished.
