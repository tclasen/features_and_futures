# Workboard

Requires Node.js 22.22.1. There are no external dependencies.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Create a project and open it to create tasks, toggle completion, and filter by All, Open, or Completed. The server binds to `0.0.0.0`; the default port is 8080 and the default database is `./data/workboard.sqlite`. Keep the database file to preserve projects, tasks, and completion across restarts. `GET /health` returns `{"status":"ok"}`.

The project list starts with Active projects. Each row shows completed/total task counts and an Archive project button. Select Archived to open or restore archived projects. Archived project pages show their tasks and allow filtering, with task creation and completion disabled. Restoring preserves project identity and all task data. Existing databases are upgraded automatically to add archive state.

Run the integration checks:

```sh
npm test
```

The checks use temporary SQLite files and verify project and task validation, creation order, project isolation, completion changes, page serving, database migration, archive/restore, summaries, and persistence after server restarts.
Client checks use a minimal DOM adapter to verify row labels, project and task filtering, validation, archive/restore controls, and disabled task edits without external dependencies.
