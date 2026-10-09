# Workboard

Requires Node.js 22.22.1. No dependencies to install.

```sh
npm start
```

The server listens on `0.0.0.0:8080` by default. Set `PORT` to choose a port and
`DB_PATH` to select the persistent SQLite file (default `data/workboard.sqlite`).

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.
On each project page, create tasks, toggle their completion checkboxes, and use
Task filter to show All, Open, or Completed tasks. Tasks stay with their project
and persist in the configured database.

Run integration checks with `npm test`. They use temporary databases and verify
validation, creation order, project identity, task ownership, completion updates,
and persistence across restarts.
