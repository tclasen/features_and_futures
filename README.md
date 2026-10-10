# Workboard

Requires Node.js 22.22.1. No installation or external dependencies are needed.

```sh
npm start
```

The HTTP server binds to `0.0.0.0` at `PORT` (default `8080`). SQLite data is stored at `DB_PATH` (default `data/workboard.sqlite`); parent directories are created automatically. Keep this file to preserve projects across restarts.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The application uses server-rendered forms and supports navigation without browser JavaScript. Tests use a temporary database and check validation, escaping, ordering, detail navigation, and process-restart persistence.
