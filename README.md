# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; the defaults are port 8080 and `data/workboard.sqlite`. Retain the configured SQLite file to preserve projects, archive state, their tasks, and task completion across restarts. Existing databases are upgraded automatically.

Health check: `curl http://localhost:8080/health`

Open a project to create tasks, toggle completion, and filter All, Open, or Completed tasks. The project list shows completion summaries and an Active/Archived filter. Archive or restore projects from their rows; archived project pages allow viewing and filtering tasks but not changing them.

Run automated HTTP, browser-script, and SQLite restart-persistence checks:

```sh
npm test
```
