# Workboard

Requires Node.js 22.22.1. No package installation or external dependencies are needed.

```sh
npm start
```

The server binds to `0.0.0.0` using `PORT` (default `8080`). Set `DB_PATH` to the SQLite file to retain projects, archive state, tasks, and completion state across restarts; the default is `./data/workboard.sqlite`. Parent directories are created automatically.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. Forms use native browser navigation; a small browser script submits completion and filter changes. Names and task titles are trimmed on the server and rendered as escaped text. SQLite IDs define creation order and remain stable across restarts. Tasks belong to a project, and completion updates are scoped to that project.

The project list initially shows Active projects. Archive and restore actions move projects between Active and Archived without losing tasks. Each row summarizes completed tasks out of all tasks. Archived project pages allow viewing and filtering tasks while disabling creation and completion controls; the server also rejects these writes with HTTP 409. Existing databases are upgraded automatically with active projects as the default, preserving their IDs and tasks.

Active project pages provide a New project name field and Rename project button. Renaming trims the name and preserves the project URL, creation order, tasks, and completion summary. Blank names are rejected. Archived projects disable rename controls and reject rename requests with HTTP 409; restoration enables renaming again. Renamed names persist in the configured SQLite file.

Each task row provides a New task title field and Rename task button. Renaming trims the title, updates its completion label, and preserves task identity, ownership, order, completion state, filter membership, and project summaries. Blank titles are rejected with a visible alert. Archived projects disable task rename controls and reject rename requests with HTTP 409; restoration enables renaming. Task titles persist across restarts.

Each task row has a Task priority selector with Low, Normal, and High options. Changes save automatically and persist across restarts. Existing and new tasks default to Normal; startup migrates older databases without changing task data. Priority edits preserve task order, ownership, completion, and summaries, and task renames preserve priority. Archived projects disable priority selectors and reject priority writes with HTTP 409; restoration preserves saved priorities and enables editing again.

Project pages provide a Priority filter with All, Low, Normal, and High options alongside Task filter. Both filters apply together and retain creation order. Opening a project from the list starts with both set to All. Their selections are carried in the page URL and every edit form, so changing completion or priority immediately shows the matching rows without resetting either filter. Renaming and validation errors also preserve selections. Filters remain usable on archived projects and never change saved task data or the summary of all tasks.
