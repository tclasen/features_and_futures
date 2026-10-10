# Workboard

Requires Node.js 22.22.1. No dependencies need to be installed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Create projects and open them to create tasks,
toggle completion, and filter by All, Open, or Completed. The database persists
projects, tasks, and completion state between restarts.
`GET /health` returns `{"status":"ok"}`.

Run the integration checks with `npm test`.
