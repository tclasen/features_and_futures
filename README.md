# Workboard

Requires Node.js 22.22.1. Uses only built-in Node modules; no installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to the
SQLite file to use (default `data/workboard.sqlite`). Its parent directory is
created automatically. Keep this file to preserve projects across restarts.
`GET /health` returns `{"status":"ok"}`.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm run check
npm test
```

Project creation uses a standard HTML form and server-side validation. Names are
trimmed before storage and escaped when rendered. Projects appear in increasing
creation ID order. Tests use isolated temporary databases and remove them afterward.
