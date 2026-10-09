# Workboard

Requires Node.js 22.22.1. No external dependencies or install step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. Keep the database file to retain projects and tasks between restarts. `GET /health` returns `{"status":"ok"}`.

Projects are listed in creation order. Names are trimmed and must not be blank; duplicate names are permitted, with distinct persistent IDs.

Each project has its own tasks, listed in creation order. Titles are trimmed and required. Completion can be checked or unchecked and is saved immediately. The Task filter offers All (the default), Open, and Completed; changing the filter does not alter saved tasks.

The Project filter defaults to Active. Archive project moves a project to Archived; Restore project returns it to Active, retaining its ID and tasks. Archived project pages allow task filtering but not creation or completion changes (also enforced by the API). Each project row shows completed/total counts across all its tasks. Archive state persists; existing databases are migrated automatically without deleting projects or tasks.

Run integration and UI behavior tests (using a temporary database and dependency-free DOM doubles):

```sh
npm test
```
