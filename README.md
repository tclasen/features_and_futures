# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. Defaults are port 8080 and `data/workboard.sqlite`; reuse the database path to retain projects, tasks, completion state, archive state, and renamed project names, task titles, task priorities, and project default priorities across restarts. Existing databases are upgraded automatically.

Health check: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests launch isolated servers and temporary SQLite databases, checking project and task creation, validation, ordering, HTML escaping, navigation markup, combined completion/priority filters and selection retention, project isolation, archive/restore, renaming and identity preservation, completion summaries, independent task priorities and project defaults, new-task inheritance, legacy database migration, health, and persistence across process restarts.

On a project page, create tasks, toggle their completion checkboxes, and choose All, Open, or Completed in Task filter. Priority filter offers All, Low, Normal, and High; both filters default to All and tasks must match both selections. Filter changes and task edits submit automatically, preserving both selections and creation order. Completion summaries always count every task. Both filters remain usable when archived. The project list defaults to Active; choose Archived to open or restore archived projects. Archived project pages allow task filtering but prevent task creation and completion changes. Each project row shows completed/total task counts. Use New project name and Rename project on active project pages to rename without changing the URL, order, or tasks. Archived projects cannot be renamed until restored. Each task row provides New task title and Rename task controls, preserving task order, ownership, and completion. Archived projects disable task renaming until restored. Each task row has a Task priority selector with Low, Normal, and High options. Existing tasks retain their saved priorities. Each project has a Default task priority selector (Low, Normal, High), initially Normal. Changes save automatically and apply only to subsequent tasks in that project; existing tasks and both filters remain unchanged. Task priority changes save without altering completion or order. Archived projects disable task priority and default priority changes until restored.
