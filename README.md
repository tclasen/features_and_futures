# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

```sh
npm start
```

The server binds to `0.0.0.0:8080`. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Each project page lets you create tasks, toggle their completion, and filter by
All, Open, or Completed. Projects and tasks persist in the configured SQLite file.

Run the integration checks with `npm test`.
