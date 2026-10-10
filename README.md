# Workboard

Requires Node.js 22.22.1. No application dependencies or installation step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port 8080 and database file `data/workboard.sqlite`. The server binds to `0.0.0.0`; database parent directories are created automatically. Keep the database file to preserve projects, their tasks, and completion state between restarts. Existing project databases are upgraded automatically when the server starts.

Open a project to create tasks and toggle their completion checkboxes. The Task filter offers All (the default), Open, and Completed; tasks remain in creation order and belong only to their project.

`GET /health` returns `{"status":"ok"}`.

Run integration tests with `npm test`. Tests use an isolated temporary database and verify project/task validation, ordering, project isolation, completion changes, page serving, and persistence across process restarts.
