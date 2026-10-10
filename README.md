# Workboard

Requires Node.js 22.22.1. No package installation is needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Both environment variables are optional; the values above are the defaults. The configured SQLite file preserves projects, their tasks, and task completion across restarts. Open a project to create tasks, change completion, and filter by All, Open, or Completed.

Health check:

```sh
curl http://localhost:8080/health
```

Run the integration tests, including a process restart against the same database:

```sh
npm test
```
