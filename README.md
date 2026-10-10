# Workboard

Requires Node.js 22.22.1. No dependencies need installing.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; `/health` returns JSON health status. Projects and their tasks (including completion state) are stored in the configured SQLite file. Open a project to create tasks, toggle completion, and filter by All, Open, or Completed. Defaults are port 8080 and `data/workboard.sqlite`.

Verify:

```sh
npm test
```

Tests use a temporary database and verify project and task creation, blank-input validation, ordering, escaping, detail navigation, project isolation, completion toggling, filtering, and persistence across server restarts.
