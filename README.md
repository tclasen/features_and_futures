# Workboard

Requires Node.js 22.22.1. No package installation or external dependencies are needed.

```sh
npm start
```

The server binds to `0.0.0.0`, with `PORT` defaulting to `8080`. `DB_PATH`
selects the persistent SQLite file and defaults to `./data/workboard.sqlite`.
The parent directory is created automatically. Keep this file when restarting.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `200` with `{"status":"ok"}`. The browser interface uses
HTML forms for project creation and navigation. Successful creation redirects
to the ordered project list; blank names render a visible validation alert.

Project pages support task creation, completion checkboxes, and the `All`,
`Open`, and `Completed` task filters. Names and titles are trimmed; blank task
titles render a visible validation alert. Tasks belong to their project and
remain in creation order. Completion changes save immediately, and the selected
filter is retained in the page URL. Project IDs, tasks, and completion state
persist in SQLite. Existing project databases gain task storage automatically.

The project list starts with the `Active` project filter. Archive projects to
move them to `Archived`, where they can still be opened or restored. Archived
project pages allow task filtering but disable task creation and completion;
the server also rejects task changes while archived. Each project row shows
completed and total task counts across all tasks. Archiving and restoring
preserve project IDs, tasks, and completion state. Existing databases gain
archive state automatically, with existing projects initially active.

Active project pages also support renaming. Names are trimmed, and blank names
leave the saved name unchanged with a visible validation alert. Renaming preserves
the project URL, creation order, tasks, and completion counts. Archived projects
disable renaming in the interface and reject rename requests on the server;
restoring a project enables renaming again.

Each task row supports renaming through `New task title` and `Rename task`.
Titles are trimmed, and blank titles show a validation alert without changing
the task. Renaming preserves task identity, project ownership, creation order,
completion state, filter membership, and project summaries. The completion
checkbox label reflects the saved title. Archived projects disable task rename
controls and reject rename requests; restoration enables renaming again.

`npm test` checks validation, HTML escaping, project isolation, filtering,
completion updates, archive/restore, renaming, summaries, read-only archived projects,
database upgrades, and persistence across server restarts.
