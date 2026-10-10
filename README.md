# Workboard

Requires Node.js 22.22.1; no external dependencies.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. Defaults are port 8080 and `./data/workboard.sqlite`. Use the same database path across restarts to retain projects, tasks, and completion state.

`GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Project pages let you create tasks, toggle completion, and filter by All, Open, or Completed. Tasks stay within their project.

The built-in Node test verifies health, project/task validation and trimming, creation order, project isolation, completion updates, and SQLite persistence across server restarts. Tests use a temporary database outside the repository.
