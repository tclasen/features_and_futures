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

`npm test` checks validation, HTML escaping, project isolation, filtering,
completion updates, database upgrades, and persistence across server restarts.
