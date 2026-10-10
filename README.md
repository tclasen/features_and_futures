# Workboard

Requires Node.js 22.22.1; no dependencies or install step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `./data/workboard.sqlite`.
The server binds to `0.0.0.0`. `GET /health` returns `{"status":"ok"}`.

```sh
npm test
```

Project pages support task creation, completion checkboxes, and All/Open/Completed filtering. Projects and tasks are saved in SQLite.

Tests exercise health, project/task validation, creation order, project isolation, completion changes, detail routes, and SQLite persistence across process restarts using a temporary database.
