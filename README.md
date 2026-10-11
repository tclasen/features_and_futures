# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`; parent directories are
created automatically. Keep the database file to preserve projects, tasks, and
completion state across restarts.

Open a project to create tasks, toggle their completion, and filter by All, Open,
or Completed. Each project has its own tasks; filtering does not change saved data.

Health check: `GET /health` returns `{"status":"ok"}`.

Run automated HTTP and persistence tests with `npm test`. Tests use a temporary
SQLite database and verify validation, creation order, project lookup, page/asset
routes, task ownership, completion updates, and persistence through a process restart.
