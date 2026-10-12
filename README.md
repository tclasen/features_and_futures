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
completion checkboxes, and All, Open, and Completed filters. A Priority filter
offers All, Low, Normal, and High; tasks must match both selected filters.
Task edits retain both filter selections and immediately update matching rows.
Each task's Low, Normal, or High priority is saved independently and cannot be
edited while its project is archived. The Default task priority selection starts
at Normal and is saved per project. New tasks inherit the saved default;
changing it leaves existing tasks and both filters unchanged. Archived projects
display the saved default with editing disabled until restored. The project list
shows completion summaries and Active/Archived filters, with archive and restore
controls. Archived projects keep their tasks visible while task creation and
completion changes are disabled. Active projects can be renamed with the
New project name field; renaming preserves their URL, order, and tasks. Archived
projects cannot be renamed until restored. Each task has a New task title field
and Rename task button; renaming preserves ownership, order, and completion.
Archived projects disable task renaming until restored.
Each task also has a Task due date textbox and Save due date button. Dates are
optional and must be real Gregorian dates in YYYY-MM-DD format, with years
0001–9999. Saving a blank value clears the date; invalid values leave the saved
date unchanged. Due dates persist independently without timezone conversion,
and archived projects disable date editing until restored.
Existing databases are migrated automatically.
Projects, names, tasks, and archive state persist across server restarts. `GET /health` returns
`{"status":"ok"}`. Run the integration checks with `npm test`.
