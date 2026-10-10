# Workboard

Requires Node.js 22.22.1. No dependencies to install.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port 8080 and `./data/workboard.sqlite`. The server binds to `0.0.0.0`. `GET /health` returns `{"status":"ok"}`.

Projects and their tasks are stored in SQLite and displayed in creation order. Each project page supports task creation, completion checkboxes, and All/Open/Completed filtering. The project list supports Active/Archived filtering, archive/restore controls, and completion summaries across all tasks. Active project pages also support project and task renaming, preserving their identities, order, ownership, completion state, and summaries. Archived projects keep their tasks visible and filterable but disable all renaming, task creation, and completion changes. Existing databases are migrated automatically. Native HTML forms provide creation and navigation; browser JavaScript submits completion and filter changes automatically.

Run the integration checks (including process-restart persistence):

```sh
npm test
```

Tests use temporary databases outside the repository and remove them afterward.
