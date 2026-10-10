# Workboard

Requires Node.js 22.22.1. No application dependencies or installation step are needed.

```sh
npm start
```

The server listens on `0.0.0.0:8080` by default. Configure the port and persistent SQLite file with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects, view completion summaries, and filter Active or Archived projects. Archive projects from their rows and restore them from the Archived list. Each project page lets you create tasks, check or uncheck completion, and filter by All, Open, or Completed. Archived projects retain their tasks and allow viewing and filtering, while task creation and completion changes are disabled. Projects, tasks, and archive state persist in the configured SQLite file; existing databases are migrated automatically. `GET /health` returns `{"status":"ok"}`.

Active project pages also provide New project name and Rename project controls. Renaming trims whitespace, requires a nonblank name, and preserves the project URL, creation order, tasks, and completion summary. Archived projects cannot be renamed; restoring them enables renaming again. Names persist across reloads and server restarts.

Run the integration checks with `npm test`. Tests use isolated temporary databases and verify project and task validation, creation order, escaping, navigation, project isolation, filtering, migration, archive/restore, archived task protection, completion summaries, renaming and archived rename protection, and persistence after server restarts.
