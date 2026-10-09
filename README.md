# Workboard

A project board built with Node.js 22.22.1, built-in HTTP and SQLite, and browser JavaScript. No installation or external dependencies are needed.

## Run

```sh
npm start
```

The server binds to `0.0.0.0` using `PORT` (default `8080`). `DB_PATH` selects the persistent SQLite file (default `./data/workboard.sqlite`). Parent directories are created automatically. For example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`. Project names are trimmed and must be nonblank; project IDs remain stable across restarts. The JSON endpoints are `GET/POST /api/projects` and `GET /api/projects/:id`; creation accepts `{ "name": "Project name" }`.

## Verify

```sh
npm test
```

Tests launch real server processes with isolated temporary SQLite files and verify validation, creation order, HTTP routes, and persistence after restart.
