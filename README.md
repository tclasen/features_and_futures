# Workboard

A project and task management application using Node.js 22.22.1, built-in HTTP and SQLite, and browser JavaScript. No dependencies or installation step are required.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

`PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The server binds to `0.0.0.0` and creates the database's parent directory if needed. Keep the configured SQLite file to retain projects, tasks, and completion states between restarts. `GET /health` returns `{"status":"ok"}`.

Each project page supports task creation, completion checkboxes, and All/Open/Completed filters. Tasks remain scoped to their owning project; filters initially select All on each page load.

## Verify

```sh
npm test
```

Tests start real server processes with a temporary SQLite database and verify health, input validation, creation order, project lookup, task ownership, completion updates, page/asset routes, and persistence after process restarts. Temporary files are removed afterward.
