# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The SQLite file retains project names, IDs, tasks, and completion state across restarts. `GET /health` returns `{"status":"ok"}`.

Projects are created using the labelled form, listed in creation order, and opened using their row's `Open project` button. The `Projects` button returns to the list. Blank names show a validation alert without creating a project.

Each project has a `Task title` form for creating trimmed task titles. Blank titles show a validation alert. Tasks appear in creation order, with completion checkboxes that save automatically. Use `Task filter` to show All (the default), Open, or Completed tasks. Tasks stay within their own project, and direct project URLs work after reloads.

Use `Project filter` to switch between Active (the default) and Archived projects. Each row shows completed/total task counts and an `Archive project` or `Restore project` button. Archived project pages keep tasks and filters available but disable task creation and completion changes. Restoration preserves project identity and task state. Existing SQLite databases are upgraded automatically; archive state persists across restarts.

Run the automated HTTP and restart-persistence checks:

```sh
npm test
```

Tests use a temporary database outside the repository and remove it afterwards.
