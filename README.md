# Workboard

Requires Node.js 22.22.1. No dependencies or installation step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`; `GET /health` returns `{"status":"ok"}`.
Projects and their tasks (including completion state) are stored in SQLite and retained across restarts.
Open a project to create tasks, toggle completion, or filter by All, Open, and Completed.
The project list filters Active and Archived projects and shows completion summaries.
Archive or restore projects from their rows. Archived project tasks remain visible but cannot be changed.
Existing databases are migrated automatically; archive state and summaries survive restarts.

Run the integration tests (including restart persistence):

```sh
node --test
```
