# Workboard

Requires Node.js 22.22.1. No package installation is needed.

```sh
npm start
```

The server listens on `0.0.0.0:8080` by default. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Within a project, create tasks, change their completion, and filter by All, Open, or Completed. Projects and tasks persist in the configured SQLite file. `GET /health` returns `{"status":"ok"}`.

Run verification with `npm test`.
