# Workboard

Requires Node.js 22.22.1. No dependencies or install step are needed.

```sh
npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. Set `PORT` to change the port and `DB_PATH` to select the persistent SQLite database (default: `data/workboard.sqlite`).

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. Tests use a temporary database and verify validation, creation order, project identity, page routes, and persistence across server restarts.
