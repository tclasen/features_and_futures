# Workboard

A dependency-free project board using Node.js 22.22.1, built-in HTTP and SQLite, and server-rendered browser pages.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the SQLite file to retain projects, tasks, and completion state between restarts.

`GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Project pages support task creation, completion checkboxes, and All/Open/Completed filtering. Tasks belong only to their project.

Tests use isolated temporary databases and verify project and task validation, creation order, HTML escaping, project navigation, task isolation, filtering, completion changes, health, and persistence across server restarts.
