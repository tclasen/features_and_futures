# Workboard

Requires Node.js 22.22.1. No application dependencies or installation step are needed.

```sh
npm start
```

The server listens on `0.0.0.0:8080` by default. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Each project page lets you create tasks, check or uncheck completion, and filter by All, Open, or Completed. Projects and tasks persist in the configured SQLite file. `GET /health` returns `{"status":"ok"}`.

Run the integration checks with `npm test`. Tests use isolated temporary databases and verify project and task validation, creation order, escaping, navigation, project isolation, filtering, and completion persistence after server restarts.
