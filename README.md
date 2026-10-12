# Workboard

Requires Node.js 22.22.1. No dependencies to install.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`. `GET /health` returns `{"status":"ok"}`.
Projects and their tasks are saved in SQLite and retained across restarts.
Open a project to create tasks, toggle completion, and filter All, Open, or
Completed tasks. Native HTML forms handle creation and navigation; small inline
browser event handlers submit completion and filter changes.

## Verify

```sh
npm test
```

Tests use a temporary database outside the repository and verify validation,
creation order, escaping, navigation, health, task filtering, project isolation,
and task/completion persistence across restarts.
