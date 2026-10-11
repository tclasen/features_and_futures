# Workboard

Requires Node.js 22.22.1. No installation or external dependencies are needed.

```sh
npm start
```

The server binds to `0.0.0.0:8080` by default. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. On each project page, create tasks, toggle their completion, and filter by All, Open, or Completed. Projects and tasks persist in the configured database across restarts. `GET /health` returns `{"status":"ok"}`.

Run the integration tests (using temporary databases outside the repository):

```sh
npm test
```
