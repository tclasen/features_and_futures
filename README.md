# Workboard

A dependency-free, server-rendered project board using Node.js 22.22.1,
JavaScript ES modules, `node:http`, and `node:sqlite`.

## Run

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). Set `DB_PATH`
to the SQLite file to retain across restarts (default `data/workboard.sqlite`).
Parent directories are created automatically. No package installation is needed.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. Projects use stable integer IDs
and are listed in creation order. Creating a project trims the name; blank
names return a visible validation alert without inserting a row.

Project pages support task creation, completion checkboxes, and All/Open/Completed
filters. Titles are trimmed and required. Tasks belong to their project and retain
creation order; completion and task IDs are saved in SQLite. Filters are stored in
the page URL and default to All. Checkbox and filter changes submit using browser
JavaScript; creation and navigation use ordinary HTML forms.

The project list defaults to Active and can show Archived projects. Each row
summarizes completed tasks out of all tasks. Archive/restore retains tasks and
completion state. Archived project pages allow viewing and filtering but disable
task creation and completion; the server also rejects task mutations with HTTP
403. Existing databases are upgraded automatically with all projects active.

Active project pages support renaming with trimmed, required names. Renaming
preserves project IDs, URLs, creation order, tasks, and completion state. Archived
projects disable rename controls and reject rename requests with HTTP 403;
restoration enables renaming again.

Each task row supports renaming with a trimmed, required title. The task's ID,
project, creation order, completion state, and filter membership remain unchanged.
Checkbox labels reflect the new title. Archived projects disable task rename
controls and reject rename requests; restoration enables them again.

Each task row has a Task priority selector with Low, Normal, and High options.
Existing and new tasks default to Normal. Priority changes persist independently
without affecting ownership, ordering, completion, or summaries; renaming retains
priority. Archived projects disable priority controls and reject priority edits
with HTTP 403. Restoration re-enables them with saved values. Existing databases
are upgraded automatically without changing task IDs or other task data.

Tests launch isolated servers and temporary databases, covering validation,
HTML escaping, ordering, navigation routes, health, project isolation, filtering,
completion toggles, archive/restore, project and task renaming, priorities,
summaries, legacy schema migration, reloads, and persistence across process restarts.
