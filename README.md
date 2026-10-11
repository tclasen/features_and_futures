# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite with no external dependencies.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Both variables are optional and default to the values above. The server binds to `0.0.0.0`. SQLite stores projects, tasks, completion state, and archive state across restarts. Existing databases migrate automatically. Open a project to create tasks, toggle completion, or filter by All, Open, and Completed. Use the Project filter to view Active or Archived projects. Archive or restore a project from its row; archived project tasks remain readable and filterable, with editing disabled. Each row shows completed and total task counts. `GET /health` returns `{"status":"ok"}`.

Run the integration checks:

```sh
npm test
```

Tests start isolated server processes and remove their temporary database directories after checking validation, creation order, navigation, task filters, project isolation, and restart persistence for both completed and open tasks, database migration, archive/restore, editing protection, and completion summaries.
