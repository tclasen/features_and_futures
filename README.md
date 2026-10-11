# Workboard

A project and task application using Node.js 22.22.1, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript. No dependencies or installation are required.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. Defaults are port `8080` and database `data/workboard.sqlite`. Keep the database file to preserve projects, tasks, and completion state across restarts.

Health: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration test uses a temporary database and verifies project/task validation, ordering, project isolation, completion updates, detail routes, health, and persistence across server-process restarts.

On a project page, create tasks, toggle their completion checkboxes, and choose All, Open, or Completed in the Task filter. The filter defaults to All on page load.
