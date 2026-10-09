# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; set `PORT` to choose another port and `DB_PATH` to choose the persistent SQLite file (default `data/workboard.sqlite`). For example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Create and open projects from the home page. Each project has its own tasks; use the completion checkboxes and the All, Open, or Completed filter to manage them. Project rows show completed/total task counts. Archive projects from the Active list and restore them from the Archived list. Archived project pages allow viewing and filtering tasks, with task creation and completion disabled. Projects, archive state, tasks, and completion state are stored in SQLite across restarts. Existing databases are upgraded automatically.

Run the integration checks with `npm test`. They use temporary SQLite databases and verify validation, creation order, escaping, navigation, health, task ownership, filtering, schema migration, archive/restore, completion summaries, and persistence across server restarts.
