# Workboard

Requires Node.js 22.22.1. No installation or external dependencies are needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; defaults are port
8080 and database `data/workboard.sqlite`. Keep the configured database file to
preserve projects, tasks, and completion state across restarts. `GET /health`
returns `{"status":"ok"}`.

Create and open projects from the home page. Each project has its own tasks;
use the completion checkboxes and the All/Open/Completed filter to manage them.
The filter starts at All when opening or reloading a project.

## Verify

```sh
npm test
```

Tests use temporary SQLite files and verify project and task validation, creation
order, routing, project isolation, completion updates, and persistence across
server-process restarts.
