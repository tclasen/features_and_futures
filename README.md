# Workboard

Tasks 001–002 provide project creation and project pages with task creation,
completion checkboxes, and All/Open/Completed filters. Uses Node.js 22.22.1,
JavaScript ES modules, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript.
No installation or external dependencies are needed.

Start:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Reuse the database path
across restarts to retain projects, tasks, and completion state.
`GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
```

Tests start isolated server processes and verify health, validation, trimming,
creation order, project routes, project ownership, completion updates, and
projects and tasks surviving a process restart.
Temporary test databases are removed afterward.
The browser script is also checked with a dependency-free DOM harness for
accessible labels, validation, filter behavior, and completion changes.
