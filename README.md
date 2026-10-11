# Workboard

A project and task application using Node.js 22.22.1, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript. No dependencies or installation are required.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. Defaults are port `8080` and database `data/workboard.sqlite`. Keep the database file to preserve projects, tasks, completion state, project names, task titles, and archive state across restarts. Existing databases migrate automatically.

Health: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration tests use temporary databases and verify validation, ordering, project isolation, completion updates and counts, archive/restore and rename protections, rename identity preservation, detail routes, health, database migration, and persistence across server-process restarts.

The Project filter defaults to Active; choose Archived to open or restore archived projects. Each project row shows completed/total task counts. Archived project pages show tasks and allow filtering, but cannot create tasks, rename tasks, or change completion.

Use New project name and Rename project on an active project page to change its name without changing its URL, order, or tasks. Archived projects cannot be renamed until restored.

On an active project page, create tasks, toggle their completion checkboxes, and choose All, Open, or Completed in the Task filter. The filter defaults to All on page load.

Each task row provides New task title and Rename task. Renames trim whitespace and preserve ownership, creation order, completion, filter membership, and summary counts. Empty titles show an alert without changing the task. Restore an archived project to enable task renaming again.
