# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; the defaults are port 8080 and `data/workboard.sqlite`. Retain the configured SQLite file to preserve projects, archive state, their tasks, and task completion across restarts. Existing databases are upgraded automatically.

Health check: `curl http://localhost:8080/health`

Open a project to create tasks, toggle completion, and filter All, Open, or Completed tasks. The project list shows completion summaries and an Active/Archived filter. Archive or restore projects from their rows; archived project pages allow viewing and filtering tasks but not changing them. Active project pages also allow renaming with `New project name` and `Rename project`, preserving the project URL, order, tasks, and summary. Archived projects cannot be renamed until restored. Each task row also offers `New task title` and `Rename task`; renaming preserves ownership, order, completion, and the selected filter. Blank titles are rejected. Archived projects disable task rename controls until restored. Each task has a `Task priority` selector with Low, Normal (the default), and High. Priorities persist independently through renames and restarts; archived projects disable priority changes until restored.

Run automated HTTP, browser-script, and SQLite restart-persistence checks:

```sh
npm test
```
