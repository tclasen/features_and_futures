# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite modules and browser HTML,
CSS, and JavaScript; no packages need to be installed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to
8080 and `DB_PATH` defaults to `data/workboard.sqlite`. The database directory is
created automatically. Keep the database file to preserve project names and IDs
across restarts. `GET /health` returns `{"status":"ok"}`.

Run the automated integration checks:

```sh
npm test
```

The tests create a temporary SQLite database, launch and restart the server, and
check validation, creation order, project retrieval, health, and persistence.

Project creation uses `POST /api/projects` with JSON `{"name":"Project name"}`.
Names are trimmed; blank or non-string names return HTTP 400. Projects are listed
in creation order by `GET /api/projects`, and individual projects are available
at `GET /api/projects/<id>`. The browser opens projects at `/projects/<id>`.
