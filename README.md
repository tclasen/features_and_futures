# Workboard

Requires Node.js 22.22.1; no external dependencies.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. Defaults are port 8080 and `./data/workboard.sqlite`. Use the same database path across restarts to retain projects.

`GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

The built-in Node test verifies health, name validation and trimming, creation order, project retrieval, and SQLite persistence across server restarts. Tests use a temporary database outside the repository.
