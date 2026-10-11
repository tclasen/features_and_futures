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

Run verification:

```sh
npm test
```

The test uses a temporary SQLite file and verifies schema migration, project and task validation, creation order, HTML escaping, navigation, project isolation, completion updates, filtering, archive/restore behavior, renaming and identity preservation, completion summaries, and persistence across server restarts.
