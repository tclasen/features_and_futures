# Workboard

Task 001 provides project creation and project pages. Uses Node.js 22.22.1,
JavaScript ES modules, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript.
No installation or external dependencies are needed.

Start:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Reuse the database path
across restarts to retain projects. `GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
```

Tests start isolated server processes and verify health, validation, trimming,
creation order, project routes, and IDs and names surviving a process restart.
Temporary test databases are removed afterward.
