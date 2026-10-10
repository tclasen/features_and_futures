# Workboard

Requires Node.js 22.22.1. There are no application dependencies to install.

```sh
npm start
```

The server binds to `0.0.0.0` at `PORT` (default `8080`). Set `DB_PATH` to the
SQLite file to use (default `data/workboard.sqlite`). Its parent directory is
created automatically. Keep this file to preserve projects between restarts.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm test
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. Project creation and
navigation use ordinary browser forms. Names are trimmed before persistence;
blank names return a visible validation alert without creating a project.
