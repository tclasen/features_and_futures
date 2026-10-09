# Workboard

Requires Node.js 22.22.1. No application dependencies or installation step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Both environment variables are optional; the values above are the defaults. The database directory is created automatically. Keep the SQLite file to preserve projects, tasks, and completion states across restarts.

Open a project to create tasks, toggle their completion checkboxes, and filter by All, Open, or Completed. Changes are saved immediately.

The project list starts with Active projects and shows completed/total task summaries. Archive a project to move it to Archived; open archived projects to view and filter their read-only tasks. Restore a project to make its tasks editable again. Archive state and task data survive restarts; existing databases are upgraded automatically.

`GET /health` returns `{"status":"ok"}`.

Run the automated HTTP, validation, navigation markup, and persistence checks:

```sh
npm test
```

Tests use a temporary SQLite database and remove it afterward.
