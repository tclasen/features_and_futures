# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to the
SQLite file to use; the default is `./data/workboard.sqlite`. Parent directories
are created automatically. Use the same file across restarts to preserve projects,
tasks, and completion state. Existing project databases are upgraded automatically.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. Project creation trims names and rejects
empty names; projects appear in creation order and retain their IDs.

Each project supports trimmed task titles, saved completion checkboxes, and an
All/Open/Completed filter (initially All). Tasks stay within their owning project
and appear in creation order. Empty titles display a validation alert.
