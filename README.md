# Workboard

Requires Node.js 22.22.1. No installation or external dependencies needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`; the server binds to `0.0.0.0`. Keep the configured database file to preserve projects, tasks, and completion state across restarts. Open a project to create tasks, toggle completion, or filter All/Open/Completed.

Health: `GET /health` returns `{"status":"ok"}`.

Run the isolated integration tests (including process-restart persistence):

```sh
npm test
```
