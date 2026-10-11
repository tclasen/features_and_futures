# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite, with no external dependencies.

Start:

```sh
npm start
```

The server binds to `0.0.0.0` on port `8080` by default. Configure the port and persistent database file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects, view completion summaries, and switch between Active and Archived projects. Archive or restore projects from their rows. Archived project pages retain task filtering while disabling task creation and completion changes. Each active project supports task creation, completion checkboxes, and All/Open/Completed filters. Projects, archive state, and tasks persist in the configured SQLite file. Existing databases are upgraded automatically. `GET /health` returns `{"status":"ok"}`.

Active project pages also support renaming with `New project name` and `Rename project`. Names are trimmed and required. Renaming preserves the project URL, list position, tasks, and completion summary. Archived projects must be restored before renaming. Renamed names persist across server restarts.

Each task row provides `New task title` and `Rename task`. Titles are trimmed and required. Renaming updates the visible title and completion checkbox label while preserving ownership, creation order, completion state, filter membership, and project summaries. Archived projects disable task renaming; restoration enables it again. Renamed task titles persist across server restarts.

Each project page has a `Priority filter` with All/Low/Normal/High options. It combines with the All/Open/Completed task filter, preserving creation order. Both selections stay in place through task edits, including edits that remove a task from the matching rows. Filters also work on archived projects. Summaries always count all tasks. Each task has an independent, persistent Low/Normal/High priority; archived projects disable priority edits.

`Default task priority` sets the priority inherited by subsequent tasks in that project. Existing and new projects initially use Normal. Changing the default preserves existing tasks and both selected filters. Each project's default persists through reloads, server restarts, renaming, archival, and restoration. Archived projects show the saved default in a disabled combobox.

Each task row has a `Task due date` textbox and `Save due date` button. Dates are optional: blank input clears the saved date. Nonempty input is trimmed and must be a real Gregorian date in `YYYY-MM-DD` format with a year from 0001 through 9999. Invalid input shows an alert and preserves the saved date. Dates persist across restarts without timezone conversion and do not change other task data, selected filters, or summaries. Archived projects disable due-date editing until restored.

Run verification:

```sh
npm test
```

The test uses a temporary SQLite file and verifies schema migration, project and task validation, creation order, HTML escaping, navigation, project isolation, completion updates, combined priority and completion filtering, edits under selected filters, project default inheritance and isolation, due-date validation and clearing, archive/restore behavior, renaming and identity preservation, completion summaries, and persistence across server restarts.
