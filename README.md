# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step are needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). `DB_PATH` selects
the persistent SQLite file (default `data/workboard.sqlite`); its parent
directory is created automatically. Use the same file across restarts.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
npm test
```

Open `/` to create and open projects. Each project page supports creating
tasks, saving their completion state, and filtering by All, Open, or Completed.
Projects and tasks retain creation order and persist in the configured database.
`GET /health` returns
`{"status":"ok"}`. The integration test uses an isolated temporary database
and verifies validation, project ownership, completion updates, ordering,
HTTP routes, and persistence across a
server restart.
