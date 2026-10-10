# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite modules, with no external dependencies.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The database directory is created automatically. Keep the same database path to preserve projects, tasks, and completion state across restarts.

Open a project to create tasks, check or uncheck completion, and filter the task list by All, Open, or Completed. Names and titles are trimmed; blank entries display a validation alert.

Health check:

```sh
curl http://localhost:8080/health
```

Run the integration checks:

```sh
npm test
```
