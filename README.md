# Workboard

A dependency-free project board using Node.js 22.22.1, built-in HTTP, and SQLite.

## Run

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. To configure the port and persistent database:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Each project supports task creation, completion checkboxes, and All/Open/Completed filtering. Projects and tasks persist in SQLite. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use temporary databases and verify validation, creation order, safe rendering, project navigation, health, task ownership, completion, filtering, and persistence across server restarts.
