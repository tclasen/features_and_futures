# Workboard

Requires Node.js 22.22.1. No packages need to be installed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). Set `DB_PATH`
to the SQLite file to retain projects, their tasks, and completion state across
restarts; the default is `data/workboard.sqlite`. Its parent directory is created automatically.
`GET /health` returns `{"status":"ok"}`.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

Tests use temporary databases outside the repository and remove them afterward.
