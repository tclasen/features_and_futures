# Workboard

Requires Node.js 22.22.1. Uses only built-in Node modules; no installation is needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. `PORT` defaults to
`8080`; `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file
to preserve projects, archive state, tasks, and completion state across restarts.

Open a project to create tasks, toggle their completion checkboxes, and choose
All, Open, or Completed in the Task filter. Tasks belong to their project and
appear in creation order.

The Project filter starts with Active projects. Archive a project to move it to
Archived, or restore it to return it to Active. Each project shows its completed
and total task counts. Archived projects remain readable with working task
filters; task creation and completion changes are disabled until restoration.
Existing database files are migrated automatically, preserving their data.

Health check:

```sh
curl http://localhost:8080/health
```

Verification:

```sh
npm test
```

The integration tests start real server processes, use temporary SQLite
databases, and check project and task validation, ordering, navigation, HTML
escaping, task filtering and ownership, completion changes, and persistence
after restarts, legacy database migration, archive/restore, summaries, and
archived-project mutation protection.
