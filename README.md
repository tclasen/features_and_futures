# Workboard

Requires Node.js 22.22.1. No dependencies need to be installed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. Configure the port and persistent
SQLite database location with environment variables:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Each project page lets you create tasks,
toggle completion, and filter by All, Open, or Completed. Projects and tasks
persist in the configured SQLite database. `GET /health` returns `{"status":"ok"}`.

Run the integration checks with `npm test`.
