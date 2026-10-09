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

Open a project to create tasks, toggle completion, and filter by All, Open, or Completed. Projects and tasks are saved in SQLite.

`GET /health` returns `{"status":"ok"}`. Tests use a temporary database and verify validation, creation order, project identity, task ownership, completion updates, page routes, and persistence across server restarts.
