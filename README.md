# Workboard

Requires Node.js 22.22.1. No package installation or external dependencies are needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the same database
path across restarts to preserve projects, tasks, completion state, and archives.
Each project provides task creation, completion checkboxes, and All/Open/Completed
filters. The project list provides Active/Archived filters and completion summaries.
Archive projects to make their tasks read-only; restore them to resume editing.
Existing databases are upgraded automatically. `GET /health` returns `{"status":"ok"}`.

Run the integration checks with:

```sh
npm test
```
