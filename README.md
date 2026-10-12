# Workboard

A dependency-free project board using Node.js 22.22.1, built-in HTTP, and SQLite.

## Run

```sh
npm start
```

The server binds to `0.0.0.0`, with `PORT` defaulting to `8080` and `DB_PATH` defaulting to `data/workboard.sqlite`. Parent database directories are created automatically. Set `DB_PATH` to a persistent, writable file location to retain projects, tasks, and completion state across restarts.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`. Project pages support task creation, completion checkboxes, and an All/Open/Completed filter. A separate All/Low/Normal/High priority filter combines with the completion filter; both selections survive edits, and matching tasks retain creation order. Filters remain usable when archived and never affect saved data or completion summaries. Opening a project from the list starts both filters at All. Tasks belong to their project and display in creation order. The project list filters Active/Archived projects and shows completion totals for all tasks. Archive/restore preserves tasks; archived pages allow viewing and filtering but disable task creation and completion changes. Active project pages also support renaming with trimmed, nonblank names; renaming preserves the URL, creation order, tasks, and summary. Each task row also supports renaming with a trimmed, nonblank title, preserving its ownership, order, completion state, and filter membership. Each task also has a Low/Normal/High priority selector. Each project has a saved Default task priority selector, initially Normal, which applies only to subsequently created tasks. Changing a default preserves existing tasks and both filter selections; defaults are independent per project and persist through renaming, archival, restoration, and restarts. Priority changes persist independently without affecting completion, order, ownership, or summaries; renaming preserves priority. Archived pages disable project and task renaming, task priority changes, and the project default priority selector until restoration. These restrictions are also enforced by the server. Existing databases are upgraded automatically while preserving IDs. Pages use native HTML forms; a small browser script submits completion, priority, and filter changes automatically. SQLite assigns permanent IDs. Names and titles are trimmed on the server and escaped when rendered.

Each task row includes an optional Task due date textbox and Save due date button. Dates are trimmed and validated as real Gregorian `YYYY-MM-DD` days (years `0001`–`9999`), without timezone conversion. Blank input clears the saved date; invalid input shows an alert and preserves it. Dates persist independently through other edits and restarts, without affecting completion or priority filters or summaries. Archived projects disable due-date edits in both the UI and server.

Project pages also provide Due from and Due through textboxes and Apply due range. Applied boundaries are inclusive and combine with completion and priority filters. Blank boundaries are unbounded; undated tasks match only when both boundaries are blank. Invalid dates or a reversed range show an alert and leave the previously applied range unchanged. The applied range is carried in navigation URLs and hidden form fields, not saved task data. Edits retain all filters and immediately re-evaluate membership. Archived projects permit range filtering, and opening a project from the list starts with empty boundaries.

## Verify

```sh
npm test
node --check server.js
```

Tests launch the real server against a temporary database and cover health, required-name validation, trimming, creation order, HTML escaping, project navigation, task validation, completion, filtering, project isolation, archive/restore, archived mutation protection, completion summaries, project and task renaming, identity and ownership preservation, task priorities and project defaults, independent updates, inheritance only by subsequent tasks, invalid-priority rejection, all combined-filter pairs and selection retention through mutations, legacy database migration, due-date validation (including leap years and year boundaries), clearing and archived date protection, inclusive and one-sided due ranges, invalid range preservation, range intersection and retention through edits, and persistence across server restarts. Temporary files are removed after the test.
