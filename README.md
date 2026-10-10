# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to 8080 and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the database file to retain projects, tasks, and completion state across restarts.

Open a project to create tasks, toggle completion, and filter by All, Open, or Completed.

Health: `curl http://localhost:8080/health`

Verification: `npm test`
