# Workboard

Requires Node.js 22.22.1. No dependencies to install.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. `PORT` defaults to
8080 and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the configured
SQLite file to preserve projects, tasks, and completion state across server restarts.

Open a project to create tasks, toggle their completion checkboxes, and filter by
All, Open, or Completed.

Health check: `GET /health` returns `{"status":"ok"}`.

Run automated validation, navigation, project-isolation, filtering, and
restart-persistence checks:

```sh
npm test
```
