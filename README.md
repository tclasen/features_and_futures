# Workboard

Requires Node.js 22.22.1. No installation or external dependencies are needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; the defaults are
port 8080 and `./data/workboard.sqlite`. The database directory is created
if necessary. Use the same `DB_PATH` after restarting to preserve projects,
tasks, and completion state.

Open a project to create tasks, toggle completion, and filter by All, Open,
or Completed. Each project keeps its own tasks in creation order.

`GET /health` returns `{"status":"ok"}`.

```sh
npm test
```

Tests exercise project and task validation, creation order, escaped names and
titles, navigation, project isolation, completion, filtering, health, and
persistence across server restarts using temporary SQLite files.
The UI uses native HTML forms with a small browser script to submit checkbox
and filter changes automatically.
