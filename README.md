# Workboard

A dependency-free, server-rendered project board using Node.js 22.22.1,
JavaScript ES modules, `node:http`, and `node:sqlite`.

## Run

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). Set `DB_PATH`
to the SQLite file to retain across restarts (default `data/workboard.sqlite`).
Parent directories are created automatically. No package installation is needed.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. Projects use stable integer IDs
and are listed in creation order. Creating a project trims the name; blank
names return a visible validation alert without inserting a row.

Tests launch isolated servers and temporary databases, covering validation,
HTML escaping, ordering, navigation routes, health, reloads, and persistence
across process restarts.
