# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`) and SQLite at
`DB_PATH` (default `./data/workboard.sqlite`). Parent directories are created
on startup. Keep that database file to preserve projects, archive states, tasks,
completion states, and task priorities across restarts. Existing databases are migrated automatically.

Example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

`GET /health` returns `{"status":"ok"}`. The UI uses HTML forms with a small
browser script to submit completion changes, priority changes, and filters automatically.
Project names and task titles are trimmed and HTML-escaped. Projects and tasks
are ordered by their persistent creation IDs. Each project's tasks can be
filtered by All (the default), Open, or Completed, combined with a Priority filter
of All (the default), Low, Normal, or High. Both filters must match; changing a
filter or editing a task preserves the other selection and creation order.
Edits immediately re-evaluate visible tasks without changing summary counts
except when completion itself changes. Both filters remain usable while archived.
The project list defaults to
Active and can show Archived projects instead. Archive and restore preserve all
tasks; archived pages allow filtering but reject task changes and renaming. Each
project row shows completed/total counts across all its tasks. Active project pages
allow renaming with a trimmed, nonblank name. Renaming preserves the project URL,
creation order, tasks, and completion states; names persist across restarts.
Each task row also supports renaming to a trimmed, nonblank title. Task renaming
preserves ownership, creation order, completion state, filter membership, and
project summaries. The completion checkbox label follows the saved title.
Archived projects disable task rename controls and reject rename requests;
restoration enables them again. Each task has an independent Low, Normal, or High
priority, defaulting to Normal for both new and migrated tasks. Priority changes
preserve all other task data and summaries, persist across restarts, and are
blocked while the project is archived.

Run automated HTTP and persistence tests:

```sh
npm test
```
