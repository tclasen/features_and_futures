# Workboard

Requires Node.js 22.22.1. No packages need to be installed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. Configure the port and persistent SQLite database path with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

On a project page, create tasks, toggle their completion checkboxes, and use
`Task filter` to view All, Open, or Completed tasks. Projects and tasks persist
in the configured SQLite file across server restarts.

Run the integration checks with:

```sh
npm test
```
