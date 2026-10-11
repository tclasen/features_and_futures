# Workboard

A dependency-free project and task board using Node.js 22.22.1, built-in HTTP and SQLite, and server-rendered HTML/CSS. Create projects and project-owned tasks, toggle task completion, and filter by All, Open, or Completed. Completion and filter controls submit forms using browser JavaScript.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Preserve that file to retain projects, tasks, IDs, and completion state across restarts. Parent directories are created automatically.

`GET /health` returns HTTP 200 with `{"status":"ok"}`.

## Verify

```sh
npm test
node --check server.js
```

Tests use temporary databases and ephemeral ports, exercising validation, creation order, HTML escaping, navigation, missing records, task isolation, completion, filtering, and persistence across process restarts.
