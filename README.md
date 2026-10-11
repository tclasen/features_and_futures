# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; the defaults are
port `8080` and database `data/workboard.sqlite`. Keep the SQLite file to retain
projects, tasks, and completion state across restarts. `GET /health` returns
`{"status":"ok"}`.

Open a project to create tasks, change completion with each task's checkbox, and
filter tasks by All, Open, or Completed. Tasks appear in creation order and belong
only to the project where they were created.

Run the integration checks:

```sh
npm test
```

The checks use a temporary SQLite file and verify validation, creation order,
project pages, safe rendering, task completion and filters, project isolation,
health, and persistence after a server restart.
