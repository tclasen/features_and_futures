# Workboard

Requires Node.js 22.22.1. No dependencies need to be installed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Create projects and open them to create tasks,
toggle completion, and filter by All, Open, or Completed. The database persists
projects, tasks, completion state, and archive state between restarts. The project
list filters Active or Archived projects and shows completion totals. Archived
projects remain viewable with task filters, but tasks cannot be changed until
the project is restored.
`GET /health` returns `{"status":"ok"}`.

Run the integration checks with `npm test`.
