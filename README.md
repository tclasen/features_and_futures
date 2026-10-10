# Workboard

A project and task workspace using Node.js 22.22.1, built-in HTTP and SQLite, and browser HTML/CSS/JavaScript. No external dependencies or install step are needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to `8080` and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the SQLite file to preserve projects, tasks, and completion states between server restarts. `GET /health` returns `{"status":"ok"}`.

Open a project to create tasks, check or uncheck their completion, and filter by All, Open, or Completed. Task titles and project names are trimmed and must not be blank. Each project shows only its own tasks in creation order.

Verify:

```sh
npm test
```

The integration tests use temporary databases and check health, form labels, validation, trimming, creation order, HTML escaping, navigation, task filtering, completion changes, project isolation, and persistence across process restarts.
