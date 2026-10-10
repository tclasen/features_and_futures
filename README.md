# Workboard

Requires Node.js 22.22.1. No package installation is needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `GET /health`
returns `{"status":"ok"}`. If omitted, `PORT` defaults to `8080` and
`DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file to
preserve projects, tasks, and completion state between restarts.

Open a project to create tasks, toggle their completion checkboxes, and
select All, Open, or Completed in the Task filter. Tasks belong to the
project where they were created.

```sh
npm test
```

The integration tests use isolated databases and verify project and task
validation, creation order, navigation markup, HTML escaping, project
ownership, filtering, completion updates, health, and persistence across
server restarts.
