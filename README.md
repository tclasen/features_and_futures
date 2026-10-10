# Workboard

Projects and tasks application using Node.js 22.22.1, JavaScript ES modules, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript. No installation or external dependencies are required.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `./data/workboard.sqlite`. The database is created automatically and reused across restarts. `GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
```

Open a project to create tasks, toggle their completion, and filter by All, Open, or Completed. Each project has its own tasks. Projects, tasks, and completion persist in the configured database.

The integration tests use isolated temporary SQLite files and check validation, trimmed names and titles, creation order, page routes, health, project isolation, and persistence of projects, tasks, and completion across server restarts.
