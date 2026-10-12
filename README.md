# Workboard

Requires Node.js 22.22.1. No dependencies or installation step are needed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). SQLite data is
stored at `DB_PATH` (default `./data/workboard.sqlite`). For example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Each project supports task creation,
completion checkboxes, and All, Open, and Completed filters. The project list
shows completion summaries and Active/Archived filters, with archive and restore
controls. Archived projects keep their tasks visible while task creation and
completion changes are disabled. Active projects can be renamed with the
New project name field; renaming preserves their URL, order, and tasks. Archived
projects cannot be renamed until restored. Existing databases are migrated automatically.
Projects, names, tasks, and archive state persist across server restarts. `GET /health` returns
`{"status":"ok"}`. Run the integration checks with `npm test`.
