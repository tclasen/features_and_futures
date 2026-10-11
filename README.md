# Workboard

Requires Node.js 22.22.1. No dependencies or installation step are needed.

```sh
npm start
```

The server listens on `0.0.0.0:8080` by default. Configure `PORT` and `DB_PATH`
to select another port or persistent SQLite file:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080/` to create and open projects. Within a project,
create tasks, toggle their completion, and filter by All, Open, or Completed.
Project URLs can be reloaded directly. Projects and tasks persist in SQLite.
`GET /health`
returns `{"status":"ok"}`. The default database is `data/workboard.sqlite`.

```sh
npm test
```

The integration test checks blank-name validation, trimming, creation order,
project routes, health, task validation and project isolation, completion updates,
and saved projects and tasks after a server restart.
