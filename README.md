# Workboard

Requires Node.js 22.22.1. There are no application dependencies to install.

```sh
npm start
```

The server binds to `0.0.0.0` at `PORT` (default `8080`). Set `DB_PATH` to the
SQLite file to use (default `data/workboard.sqlite`). Its parent directory is
created automatically. Keep this file to preserve projects, tasks, and completion
state between restarts.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm test
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. Project creation and
navigation use ordinary browser forms. Names are trimmed before persistence;
blank names return a visible validation alert without creating a project.
Each project has its own tasks. Titles are trimmed and blank titles show a
validation alert. Checkboxes save completion immediately; the task filter shows
All (the default), Open, or Completed tasks in creation order. Direct project
URLs remain usable after reloads and restarts.
