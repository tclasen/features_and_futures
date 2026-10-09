# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; default port is
8080 and default database path is `data/workboard.sqlite`. Keep the database
file to preserve projects, tasks, and completion state across restarts.

Open a project to create tasks, toggle their completion checkboxes, and select
All, Open, or Completed in the Task filter. Tasks belong only to their project.

`GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use an isolated temporary SQLite database and verify validation, project
ordering, HTML escaping, detail navigation, health, task validation, completion,
filtering, project isolation, and restart persistence.
