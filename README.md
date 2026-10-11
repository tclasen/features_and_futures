# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`.
`PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`.
Use the same database path across restarts to retain projects, tasks, and completion state.
`GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
```

Each project page supports task creation, completion checkboxes, and an All/Open/Completed
filter. New tasks are open, and both project names and task titles are trimmed.

The integration test uses an isolated database, exercises project and task validation,
creation order, project isolation, and completion updates, and restarts the server to
verify persistence.
The browser-code interaction test uses a small DOM harness to check task validation,
filtering, checkbox updates, and save-error recovery without external dependencies.
