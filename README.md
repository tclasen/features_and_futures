# Workboard

Requires Node.js 22.22.1. No dependencies need to be installed.

Create projects at `/`, then open a project to create tasks, toggle their
completion, and filter by All, Open, or Completed. Projects and tasks are saved
in SQLite and remain available after restarting the server. The project list
filters Active or Archived projects and shows completion totals. Archive a
project to make its tasks read-only; restore it to resume editing.
Active projects can be renamed from their project page without changing their
URL, order, tasks, or completion totals. Archived projects cannot be renamed.
Each task can also be renamed in its row while preserving its completion state,
project, and order. Archived projects disable task renaming until restored.

```sh
npm start
```

The server listens on `0.0.0.0:8080` by default. Set `PORT` to choose a port
and `DB_PATH` to choose the persistent SQLite file (default `data/workboard.sqlite`).

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Run the integration checks with `npm test`. They cover validation, creation
order, renaming, project isolation, completion summaries, archive/restore, migration of
existing databases, health, and restart persistence.
