# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

```sh
npm start
```

The server binds to `0.0.0.0:8080`. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`.

Each project page lets you create tasks, toggle their completion, and filter by
All, Open, Completed, or Deleted. A separate Priority filter offers All, Low, Normal, and
High. Tasks must match both filters and retain their creation order. Task edits
preserve both selections and immediately update the matching rows. Both filters
remain usable in archived projects, and completion summaries always count all live
tasks. The project list shows completion summaries and lets you
filter Active or Archived projects, archive projects, and restore them. Archived
projects keep their tasks visible but disable task creation and completion changes.
Active project pages also let you rename projects with `New project name` and
`Rename project`. Names are trimmed and required. Renaming preserves the URL,
creation order, tasks, and completion summary. Archived projects disable renaming;
restoration enables it again.
Each task can also be renamed and assigned a Low, Normal, or High priority.
Existing tasks default to Normal. Each project's Default task priority starts at
Normal and can be set to Low, Normal, or High. New tasks inherit the saved default;
changing it leaves existing tasks and both filters unchanged. Defaults persist
independently for each project and are disabled during archival.
Renaming preserves completion and
priority; archived projects disable task renaming and priority changes.
Each task also has an optional Task due date and Save due date button. Dates use
real Gregorian calendar days in YYYY-MM-DD format (years 0001–9999), without
timezone conversion. Saving blank text clears the date; invalid dates show an
alert and preserve the saved value. Due dates persist independently, and archived
projects disable their date controls until restoration.
Project pages also provide Due from and Due through fields and Apply due range.
Applied boundaries are inclusive and intersect the completion and priority filters.
Either boundary can be blank; undated tasks match only when both are blank.
Invalid dates or reversed boundaries show an alert and preserve the applied range.
Task edits immediately update matching rows without resetting any filter. Range
controls remain usable while archived, and opening a project starts with empty
boundaries.
Each task row offers Destination project and Move task. Destinations list other
active projects in project creation order. A first arrival appends the task after all
positions established in its destination; returning restores its remembered position.
Positions are remembered independently per project and survive restarts. Moving
preserves its identity, title, completion, priority and due date, and keeps the source
page and all filters open. Summaries reflect current ownership. Archived projects
cannot send or receive tasks; move controls are disabled when archived or when no
eligible destination exists.
Projects, names, tasks, and archive state persist in the configured SQLite file; existing
databases are migrated automatically.

The project list provides Project search and Search projects. Each project page
provides Task search and Search tasks. Search applies a substring query with ASCII
case ignored and surrounding query whitespace trimmed. Runs of ASCII spaces and
horizontal tabs in queries and names/titles match as one space, without changing
the saved or displayed names/titles. Other internal whitespace remains significant.
Project search intersects Active/Archived, and task search intersects completion,
priority, and the applied due range. Searches retain all other filters, order, and
all-live-task summaries. Edits immediately update task search membership. Search remains
usable while archived and starts empty when opening either page or returning through
Projects.

Run the integration checks with `npm test`.

Each task row provides a multiline Task notes field and Save notes button. Notes
are saved as plain text exactly as entered, including whitespace, Unicode and
literal markup; empty text clears them. Notes persist and travel with moved tasks
without changing any other data or filters. Searches still match only names and
titles. Archived projects display notes with editing disabled until restoration.
Existing databases initialize notes to empty while preserving all prior data.

Live task rows offer Delete task; deleted rows offer Restore task. Deletion is
persistent and reversible, retaining all fields and remembered project positions.
All, Open and Completed exclude deleted tasks; Deleted intersects the same priority,
due range and title search controls. Summaries count only live tasks. Deleted rows
show saved data with editing and movement disabled until restoration. Archived
projects also disable deletion and restoration. Database upgrades keep existing
tasks live.
