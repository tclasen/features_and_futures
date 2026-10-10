# Workboard

Requires Node.js 22.22.1. No dependencies need installing.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; `/health` returns JSON health status. Projects and their tasks (including completion state) are stored in the configured SQLite file. Open a project to create tasks, toggle completion, and filter by All, Open, or Completed. Filter the project list by Active or Archived, archive projects, or restore them without losing tasks. Active project pages support renaming without changing their URL, order, or tasks. Archived projects remain viewable with read-only tasks and disabled rename controls. Each project row shows its completed/total task count. Defaults are port 8080 and `data/workboard.sqlite`.

Verify:

```sh
npm test
```

Tests use a temporary database and verify project and task creation, blank-input validation, ordering, escaping, detail navigation, project isolation, completion toggling, filtering, archive/restore, read-only archived tasks, completion summaries, rename validation and identity preservation, archived rename protection, legacy schema migration, and persistence across server restarts.
