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
Existing tasks default to Normal when migrating from databases without priorities.
New tasks inherit their project's saved default priority. Priority changes persist independently
without affecting ownership, ordering, completion, or summaries; renaming retains
priority. Archived projects disable priority controls and reject priority edits
with HTTP 403. Restoration re-enables them with saved values. Existing databases
are upgraded automatically without changing task IDs or other task data.

Project pages also have an All/Low/Normal/High Priority filter. Tasks must match
both completion and priority filters and retain creation order. Both selections
are preserved through edits and validation errors; edits immediately re-evaluate
visible rows. Filters remain usable when archived and never change saved data or
completion summaries. Opening from the project list starts both filters at All.

Each project page has a Default task priority selector (Low/Normal/High), initially
Normal for existing and new projects. Changes apply only to subsequently created
tasks in that project, leaving existing tasks, both filters, and summaries intact.
Defaults persist through restarts, renaming, archival, and restoration. Archived
projects disable this selector and reject default changes with HTTP 403.

Each task has an optional Task due date textbox and Save due date button. Values
are trimmed and must be real Gregorian dates in YYYY-MM-DD format (years
0001–9999); blank values clear the date. Invalid values show an alert without
changing saved data. Dates are calendar days without timezone conversion, persist
independently, and preserve filters and other task fields. Archived projects
disable these controls and reject due-date edits with HTTP 403. Existing databases
migrate with empty due dates.

Tests launch isolated servers and temporary databases, covering validation,
HTML escaping, ordering, navigation routes, health, project isolation, filtering,
completion toggles, archive/restore, project and task renaming, priorities,
combined filter combinations and selection preservation, project default priorities
and inheritance without changing existing tasks, due-date calendar boundaries,
validation, clearing, independence and archive protection, summaries, legacy schema migration, reloads, and persistence across process restarts.
