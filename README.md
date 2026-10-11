# Workboard

Requires Node.js 22.22.1. No dependencies need to be installed.

```sh
npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`.
To configure the port and persistent SQLite file:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The default database is `./data/workboard.sqlite`. Projects retain their names,
creation order, and IDs across server restarts. `GET /health` returns
`{"status":"ok"}`.

Open a project to create tasks, check or uncheck their completion, and filter by
All, Open, or Completed. Tasks belong to their project and retain their titles,
creation order, and completion state across page reloads and server restarts.

Filter projects by Active or Archived. Archive and restore projects from their
rows; archived projects keep their tasks visible but disable task creation and
completion changes. Each project row shows completed tasks out of all tasks.
Archive state and summaries persist with the configured database. Existing
databases are migrated automatically, with existing projects initially active.

Run the integration checks (using an isolated temporary database):

```sh
npm test
```
