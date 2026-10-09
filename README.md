# Workboard

A project board built with Node.js 22.22.1, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript. No packages need to be installed.

Run:

```sh
DB_PATH=./data/workboard.sqlite PORT=8080 npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080`, and `DB_PATH` defaults to `./data/workboard.sqlite`. The database directory is created automatically. Keep the database file to retain project names and IDs across restarts.

Open `http://localhost:8080/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Verification:

```sh
npm test
node --check server.js
node --check database.js
node --check public/app.js
```

Tests use temporary SQLite files outside the repository and verify validation, ordering, HTTP routes, and persistence across server process restarts.
