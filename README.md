# Workboard

Requires Node.js 22.22.1. No dependencies or installation step required.

Start:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; defaults are port 8080 and `./data/workboard.sqlite`. Keep the database file to preserve projects, tasks, and completion state across restarts.

Open a project to create tasks, toggle completion, and filter by All, Open, or Completed. Use New project name and Rename project to rename active projects without changing their URL, list position, or tasks. Names are trimmed and must not be blank. Archived projects cannot be renamed until restored.

Each task row provides New task title and Rename task. Renaming trims the title and preserves task ownership, order, completion state, and summary counts. Blank titles are rejected. Archived projects disable task rename controls until restored.

The project list defaults to Active. Archive projects and select Archived to open or restore them. Archived project tasks are read-only; restoration preserves all tasks and completion state. Each project row summarizes completed and total tasks. Existing databases are migrated automatically.

Health check:

```sh
curl http://localhost:8080/health
```

Run the integration tests (temporary database, removed after testing):

```sh
npm test
```
