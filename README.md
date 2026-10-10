# Workboard

Requires Node.js 22.22.1. No package installation or external dependencies are needed.

```sh
npm start
```

The server binds to `0.0.0.0` using `PORT` (default `8080`). Set `DB_PATH` to the SQLite file to retain projects, tasks, and completion state across restarts; the default is `./data/workboard.sqlite`. Parent directories are created automatically.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. Forms use native browser navigation; a small browser script submits task completion and filter changes. Names and task titles are trimmed on the server and rendered as escaped text. SQLite IDs define creation order and remain stable across restarts. Tasks belong to a project, and completion updates are scoped to that project. Existing project databases are upgraded automatically without changing project data.
