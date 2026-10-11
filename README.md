# Workboard

Requires Node.js 22.22.1. No package installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to the SQLite file to use (default `./data/workboard.sqlite`). Its parent directory is created automatically. Keep this file across server restarts to preserve projects, tasks, completion state, and archive state. Existing databases are migrated automatically.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The browser provides project creation at `/` and individual project pages at `/projects/<id>`.

Project pages support task creation, saved completion checkboxes, and All/Open/Completed filters. Tasks belong only to their project; filters default to All on each page load.

The Priority filter offers All, Low, Normal, and High. Tasks must match both filters and stay in creation order. Each filter keeps its selection when the other changes or a task is edited. Completion and priority edits immediately update matching rows. Both filters work in archived projects; filtering never changes saved data or completion summaries.

The project list defaults to Active and can show Archived projects. Archive and restore preserve all tasks. Archived project pages allow viewing and filtering tasks while task creation and completion controls are disabled; the server also rejects these changes. Each project row shows completed/total counts across all its tasks.

Active project pages allow renaming with a trimmed, nonempty name. Names persist without changing project URLs, list order, tasks, or summaries. Archived projects cannot be renamed until restored; both the browser controls and server enforce this restriction.

Each task row allows renaming with a trimmed, nonempty title. Renaming preserves ownership, creation order, completion state, filter membership, and project summaries. The completion checkbox label follows the saved title. Archived projects disable task rename controls and reject title updates until restored. Task titles persist across reloads and server restarts.

Each task has a saved Low, Normal, or High priority, defaulting to Normal for existing and new tasks. Priority changes preserve the task's other fields and project summary; renaming preserves priority. Archived projects disable priority controls and reject updates until restored. Priorities persist across reloads and server restarts.
