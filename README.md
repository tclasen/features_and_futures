# Workboard

Requires Node.js 22.22.1. No package installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to the SQLite file to use (default `./data/workboard.sqlite`). Its parent directory is created automatically. Keep this file across server restarts to preserve projects.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The browser provides project creation at `/` and individual project pages at `/projects/<id>`.
