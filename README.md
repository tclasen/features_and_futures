# Workboard

Requires Node.js 22.22.1. No package installation is needed.

Start the application:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0` and exposes
`GET /health`. `PORT` defaults to `8080`; `DB_PATH` defaults to
`./data/workboard.sqlite`. Keep the database file to retain projects, tasks and completion state across
restarts, including archive state.

The project list starts with Active projects. Use Project filter to view Archived
projects and restore them. Each row shows completed and total task counts.
Each task has a saved Low, Normal, or High priority, initially Normal. Changing
priority preserves its title, completion state and position. Archived project
pages allow task filtering but disable task creation, completion, renaming and
priority changes. Restoring a project enables editing with saved values intact.

Run the integration checks:

```sh
npm test
```

Tests use a temporary database outside the repository and remove it afterward.
