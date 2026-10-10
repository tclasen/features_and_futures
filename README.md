# Workboard

Requires Node.js 22.22.1. No application dependencies or installation steps.

```sh
npm start
```

The HTTP server binds to `0.0.0.0`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. Parent directories are created automatically. Keep the configured SQLite file to preserve projects, tasks, priorities, completion state, and archive state across restarts. Existing databases are upgraded automatically without losing data.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
npm test
```

Open `/` to create and open projects. The Project filter initially shows Active; switch to Archived to open or restore archived projects. Rows summarize all tasks as completed/total counts. Archiving preserves tasks but prevents task creation and completion changes, including through the API. Active project pages also support renaming with New project name and Rename project. Names are trimmed and required; renaming preserves the project URL, creation order, tasks, and summaries. Archived projects cannot be renamed until restored. Each project page supports task creation, completion checkboxes, and All/Open/Completed filtering. Each task row supports New task title and Rename task: titles are trimmed and required, while ownership, creation order, completion, and summaries stay unchanged. Archived projects disable task renaming until restored. Each task has a Task priority selector with Low, Normal, and High options. Existing and new tasks default to Normal. Priority changes persist independently and preserve task identity, title, completion, order, and summaries; renaming preserves priority. Archived projects disable priority edits until restored. Task filters initially show All and do not change stored tasks. `GET /health` returns `{"status":"ok"}`.

Tests use temporary SQLite files outside the repository and cover validation, creation order, routes, project isolation, completion updates, schema migration, archive/restore write protection, project and task rename validation and identity preservation, summaries, priority migration/defaults/validation/independence, and persistence after server restarts.
