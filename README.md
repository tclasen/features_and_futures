# Workboard

Requires Node.js 22.22.1. No package installation or external dependencies are needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080`, and `DB_PATH` defaults to `data/workboard.sqlite`. The database directory is created automatically. Keep the same database file to preserve projects, tasks, completion state, and archives across restarts. Existing databases gain the tasks table and project archive column automatically on startup, preserving saved data.

Open `http://localhost:8080/` to create and open projects. Each project page supports task creation, completion checkboxes, and All/Open/Completed filters. Filters initially show All and do not change saved tasks. `GET /health` returns `{"status":"ok"}`.

The project list initially shows Active projects. Archive a project to move it to the Archived filter, or restore it there to return it to Active. Each row shows completed/total counts across all its tasks. Archived project pages still support task filtering, but task creation and completion changes are disabled and rejected by the API.

Run verification:

```sh
npm test
node --check server.js
node --check public/app.js
```

The integration tests use temporary SQLite databases and verify validation, creation order, project lookup, task ownership, completion updates, archive/restore behavior, completion summaries, legacy database migration, page routes, health, and persistence after server restarts.
