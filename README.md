# Workboard

Requires Node.js 22.22.1. Uses JavaScript ES modules, Node's built-in HTTP
server and SQLite, and browser HTML/CSS/JavaScript. No packages need installing.

Start:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH` defaults
to `./data/workboard.sqlite`. Keep the database file to retain projects and tasks across
restarts. The database parent directory is created automatically.

Visit `/` to create and open projects. `GET /health` returns
`{"status":"ok"}`. Names are trimmed and must not be empty; project IDs are
stable and projects appear in creation order.

On a project page, create tasks with trimmed, nonempty titles. Tasks start open;
use their completion checkboxes to save changes. The Task filter defaults to All
and can show Open or Completed tasks. Each project owns its tasks, which appear
in creation order. Task titles and completion states persist across restarts.
Existing project databases are extended automatically when the server starts.

Run integration tests:

```sh
npm test
```

Tests use a temporary database outside the repository and check validation,
creation order, the health endpoint, detail routes, project isolation, completion
validation, and restart persistence for both projects and tasks.
