# Workboard

Requires Node.js 22.22.1. No dependencies or installation step required.

Start:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; defaults are port 8080 and `./data/workboard.sqlite`. Keep the database file to preserve projects, tasks, and completion state across restarts.

Open a project to create tasks, toggle completion, and filter by All, Open, or Completed.

Health check:

```sh
curl http://localhost:8080/health
```

Run the integration tests (temporary database, removed after testing):

```sh
npm test
```
