# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The server binds to `0.0.0.0`. Keep the database file to preserve projects, archive state, tasks, and completion state across restarts. Existing databases are migrated automatically. Parent directories are created automatically.

Create projects on the home page, then open a project to create tasks and toggle completion. Use New project name and Rename project to rename an active project. Names are trimmed and required; renaming preserves the URL, creation order, tasks, and completion summary and persists across restarts. The Task filter shows All, Open, or Completed tasks in creation order; it defaults to All on each page load.

Each task row provides New task title and Rename task. Titles are trimmed and required; renaming preserves ownership, creation order, completion, filter membership, and the project summary. Task titles persist across restarts. Each task has a Task priority selector with Low, Normal, and High options. Existing and new tasks default to Normal; priority edits persist independently without changing task order, title, completion, or summaries. Renaming preserves priority. Archived projects disable task renaming and priority edits until restored.

The Project filter defaults to Active. Archive projects to move them to Archived, or restore them without losing tasks. Archived project pages are read-only, but task filtering remains available. Each project row summarizes completed tasks out of all tasks.

`GET /health` returns `{"status":"ok"}`.

Run automated tests (HTTP/SQLite integration including restart persistence, and browser-controller tests using a minimal DOM adapter):

```sh
npm test
```
