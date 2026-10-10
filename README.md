# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to 8080 and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the database file to retain projects, tasks, completion state, and archive state across restarts.

Open a project to create tasks, toggle completion, and filter by All, Open, or Completed. The project list shows completion summaries and an Active/Archived filter. Archive projects to make their tasks read-only; restore them from the Archived list to resume editing. Existing databases migrate automatically.

Health: `curl http://localhost:8080/health`

Verification: `npm test`
