# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step are needed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`) and the SQLite file
at `DB_PATH` (default `data/workboard.sqlite`). The database directory is created
automatically. Keep this file to preserve project names and IDs across restarts.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. Projects are created through
the home page and can be opened individually. Blank names are rejected; names
are trimmed and displayed safely as text. Pages use standard HTML forms.
