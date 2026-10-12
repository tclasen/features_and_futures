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

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`. Project pages support task creation, completion checkboxes, and an All/Open/Completed filter. Tasks belong to their project and display in creation order. The project list filters Active/Archived projects and shows completion totals for all tasks. Archive/restore preserves tasks; archived pages allow viewing and filtering but disable task creation and completion changes. Active project pages also support renaming with trimmed, nonblank names; renaming preserves the URL, creation order, tasks, and summary. Each task row also supports renaming with a trimmed, nonblank title, preserving its ownership, order, completion state, and filter membership. Each task also has a Low/Normal/High priority selector, defaulting to Normal for new and existing tasks. Priority changes persist independently without affecting completion, order, ownership, or summaries; renaming preserves priority. Archived pages disable project and task renaming and priority changes until restoration. These restrictions are also enforced by the server. Existing databases are upgraded automatically while preserving IDs. Pages use native HTML forms; a small browser script submits completion, priority, and filter changes automatically. SQLite assigns permanent IDs. Names and titles are trimmed on the server and escaped when rendered.

## Verify

```sh
npm test
node --check server.js
```

Tests launch the real server against a temporary database and cover health, required-name validation, trimming, creation order, HTML escaping, project navigation, task validation, completion, filtering, project isolation, archive/restore, archived mutation protection, completion summaries, project and task renaming, identity and ownership preservation, priority defaults and independent updates, invalid-priority rejection, legacy database migration, and persistence across server restarts. Temporary files are removed after the test.
