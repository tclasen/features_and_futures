# Workboard

Requires Node.js 22.22.1. No application dependencies need installation.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. The database directory
is created automatically. Keep the same database path to preserve projects
across server restarts.

`GET /health` returns `{"status":"ok"}`.

Run the HTTP, persistence, and UI handler checks with:

```sh
npm test
```
