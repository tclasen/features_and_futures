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

`GET /health` returns HTTP 200 with `{"status":"ok"}`. Forms use native browser navigation; a small browser script submits completion and filter changes. Names and task titles are trimmed on the server and rendered as escaped text. SQLite project IDs define project creation order and remain stable across restarts. Tasks have a saved position within their project, initially in creation order. Tasks belong to a project, and completion updates are scoped to that project.

The project list initially shows Active projects. Archive and restore actions move projects between Active and Archived without losing tasks. Each row summarizes completed tasks out of all tasks. Archived project pages allow viewing and filtering tasks while disabling creation and completion controls; the server also rejects these writes with HTTP 409. Existing databases are upgraded automatically with active projects as the default, preserving their IDs and tasks.

Active project pages provide a New project name field and Rename project button. Renaming trims the name and preserves the project URL, creation order, tasks, and completion summary. Blank names are rejected. Archived projects disable rename controls and reject rename requests with HTTP 409; restoration enables renaming again. Renamed names persist in the configured SQLite file.

Each task row provides a New task title field and Rename task button. Renaming trims the title, updates its completion label, and preserves task identity, ownership, order, completion state, filter membership, and project summaries. Blank titles are rejected with a visible alert. Archived projects disable task rename controls and reject rename requests with HTTP 409; restoration enables renaming. Task titles persist across restarts.

Each task row has a Task priority selector with Low, Normal, and High options. Changes save automatically and persist across restarts. Existing tasks retain their saved priorities; startup migrates older databases without changing task data. Priority edits preserve task order, ownership, completion, and summaries, and task renames preserve priority. Archived projects disable priority selectors and reject priority writes with HTTP 409; restoration preserves saved priorities and enables editing again.

Project pages provide a Priority filter with All, Low, Normal, and High options alongside Task filter. Both filters apply together and retain creation order. Opening a project from the list starts with both set to All. Their selections are carried in the page URL and every edit form, so changing completion or priority immediately shows the matching rows without resetting either filter. Renaming and validation errors also preserve selections. Filters remain usable on archived projects and never change saved task data or the summary of all tasks.

Each project has a Default task priority selector with Low, Normal, and High options, initially Normal. Changes save automatically and apply only to subsequently created tasks in that project. Defaults persist through reloads, restarts, renames, archive and restore without changing existing tasks, completion summaries, or either selected filter. Archived projects display a disabled selector and reject default changes with HTTP 409. Startup adds the Normal default to existing projects.

Each task row has a Task due date textbox and Save due date button. Dates are optional: blank or whitespace-only values clear the saved date. Other values are trimmed and must be real Gregorian calendar dates in `YYYY-MM-DD` format, with years from `0001` through `9999`. Invalid input displays an alert and preserves the previous date. Dates are stored as calendar-day strings without timezone conversion. Saving dates preserves both filters and all other task data; task renaming preserves dates. Archived projects disable due-date controls and reject writes with HTTP 409. Existing databases gain empty due dates automatically, and saved dates survive restarts and restoration.

Project pages provide Due from and Due through textboxes and an Apply due range button. Boundaries use the same calendar-date validation and match inclusively. Blank boundaries are unbounded; undated tasks match only when both are blank. The applied range intersects completion and priority filters without changing task order or all-task summaries. Invalid dates or reversed boundaries display an alert and retain the previous applied range and visible tasks. All edit forms and filter changes carry the applied range, so edits immediately re-evaluate membership without resetting filters. Range controls remain usable in archived projects. The range is page state carried in the URL, rather than saved task data; reopening a project from the list starts with empty boundaries.

Each task row provides a Destination project selector and Move task button. Destinations contain only other active projects, in project creation order using their current names. Moving atomically changes ownership and appends the task after the destination’s existing tasks, preserving its ID, title, completion, priority and due date. Newly created tasks also append after existing tasks. The source stays open with all filters and applied due boundaries retained; both summaries reflect current ownership. Archived sources and destinations are rejected by storage, and archived rows or rows without eligible destinations disable both move controls. Existing databases gain saved task positions preserving their prior order. Moves survive server restarts and can be repeated.
