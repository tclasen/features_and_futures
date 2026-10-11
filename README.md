# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step are needed.

```sh
npm start
```

The server binds to `0.0.0.0` using `PORT` (default `8080`). SQLite data is stored
at `DB_PATH` (default `data/workboard.sqlite`); keep this file to preserve projects
across restarts. Parent directories are created automatically.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm test
npm run check
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. The application uses
server-rendered HTML and standard browser forms. Project names are trimmed on
creation and escaped for display; project IDs provide stable URLs.
