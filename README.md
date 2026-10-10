# Workboard

Requires Node.js 22.22.1. No package installation or external dependencies are needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080`, and `DB_PATH` defaults to `data/workboard.sqlite`. The database directory is created automatically. Keep the same database file to preserve projects, tasks, and completion state across restarts. Existing project databases gain the tasks table automatically on startup.

Open `http://localhost:8080/` to create and open projects. Each project page supports task creation, completion checkboxes, and All/Open/Completed filters. Filters initially show All and do not change saved tasks. `GET /health` returns `{"status":"ok"}`.

Run verification:

```sh
npm test
node --check server.js
node --check public/app.js
```

The integration tests use temporary SQLite databases and verify validation, creation order, project lookup, task ownership, completion updates, page routes, health, and persistence after server restarts.
