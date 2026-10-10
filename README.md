# Workboard

Requires Node.js 22.22.1. No package installation is needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `GET /health`
returns `{"status":"ok"}`. If omitted, `PORT` defaults to `8080` and
`DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file to
preserve projects, tasks, completion state, and archive state between restarts.
Existing databases are upgraded automatically.

Open a project to create tasks, toggle their completion checkboxes, and
select All, Open, or Completed in the Task filter. Tasks belong to the
project where they were created.

Use the Project filter to switch between Active and Archived projects. Archive
or restore a project from its row. Archived projects remain readable, including
task filters, but task creation and completion changes are disabled. Each project
row shows completed tasks out of all tasks.

```sh
npm test
```

The integration tests use isolated databases and verify project and task
validation, creation order, navigation markup, HTML escaping, project
ownership, filtering, completion updates, health, and persistence across
server restarts, archive/restore behavior, summaries, and database migration.
