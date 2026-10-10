# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). SQLite data is
stored at `DB_PATH` (default `data/workboard.sqlite`); keep this file to
preserve projects, archive state, tasks and completion state across restarts. Parent directories
are created automatically.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
npm test
npm run check
```

`GET /health` returns HTTP 200 with `{"status":"ok"}`. Projects are created
through the form at `/` and opened at `/projects/<id>`.
Each project page supports creating tasks, toggling completion and filtering by
All, Open or Completed. Task filters use the page's `filter` query parameter;
opening a project without it defaults to All.

The project list defaults to Active; select Archived to open or restore archived
projects. Archiving preserves all tasks but disables task creation and completion
changes until restoration. Each project row summarizes completed tasks out of all
its tasks, independently of the task filter. Existing SQLite files are upgraded
automatically, with existing projects initially active.

Active project pages also support renaming. Names are trimmed and cannot be blank.
Renaming preserves the project's URL, creation order, tasks and completion summary.
Archived projects cannot be renamed until restored. Renamed projects persist in
the same SQLite file across restarts.
