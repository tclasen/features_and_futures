# Workboard

Requires Node.js 22.22.1. No package installation is needed.

```sh
npm start
```

The server listens on `0.0.0.0:8080` by default. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Within a project, create tasks, change their completion, and filter by All, Open, or Completed. Filter projects by Active or Archived and archive or restore them from their rows. Each row summarizes completed tasks. Archived project pages allow viewing and filtering tasks while task creation and completion controls are disabled. Projects, archive state, and tasks persist in the configured SQLite file. Existing databases migrate automatically. `GET /health` returns `{"status":"ok"}`.

Active project pages also allow renaming with New project name and Rename project. Names are trimmed and required. Renaming preserves the project URL, list order, tasks, and completion summary. Archived projects cannot be renamed until restored. Renamed names persist across restarts.

Run verification with `npm test`.
