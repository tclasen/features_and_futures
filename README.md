# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite with no external dependencies.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to select the persistent SQLite file (default `data/workboard.sqlite`). For example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and browse projects, view completion summaries, and archive or restore projects. Open an active project to rename it, create or rename tasks, toggle completion, choose each task's Low, Normal, or High priority, and combine the All/Open/Completed task filter with the All/Low/Normal/High priority filter. Both filters initially select All. Edits immediately update matching rows without resetting either filter; summaries always count every task. Existing and new tasks default to Normal priority. Archived projects allow viewing and filtering tasks, with renaming and task changes disabled. Renaming preserves identity, position, completion, and priority. All changes persist across server restarts. `GET /health` returns `{"status":"ok"}`.

Run the HTTP and persistence checks with:

```sh
npm test
```
