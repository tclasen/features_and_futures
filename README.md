# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite, with no application dependencies.

Run:

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. Set `PORT` to choose a port and
`DB_PATH` to choose the persistent SQLite file (default: `data/workboard.sqlite`).
For example:

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Verify creation, validation, navigation, and persistence across process restarts:

```sh
npm test
```
