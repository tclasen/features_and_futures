# Workboard

Requires Node.js 22.22.1. There are no external dependencies.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). SQLite data is
stored at `DB_PATH` (default `data/workboard.sqlite`). Parent directories are
created automatically. Reuse the same database path to preserve projects.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The application uses server-rendered
HTML forms; project names are trimmed on the server and escaped for display.
