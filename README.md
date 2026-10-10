# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite with no external dependencies.

Start the application:

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). `DB_PATH` selects the persistent SQLite file (default `data/workboard.sqlite`); its parent directory is created automatically.

```sh
PORT=8080 DB_PATH=data/workboard.sqlite npm start
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`. Project names are trimmed, required, and escaped when rendered. Projects are listed by their persistent creation IDs. Form submissions redirect after successful creation so refreshing the list does not create another project.

Project pages support task creation, completion checkboxes, and All/Open/Completed filters. Task titles are trimmed and required. Tasks belong to their project, and completion persists in SQLite. Filter selection is stored in the page URL; task submissions preserve the current filter. The browser submits completion and filter changes automatically.

The project list starts with Active projects and supports an Archived filter. Archive and restore preserve project IDs, tasks, and completion state. Archived project pages allow task filtering but disable creation and completion changes; the server also rejects these mutations. Each project row shows completed/total counts across all its tasks. Existing databases are migrated automatically, with existing projects remaining active.

Run syntax checks and integration tests:

```sh
npm run check
npm test
```

The integration test starts real server processes on ephemeral ports and verifies validation, creation order, escaping, task filtering, project isolation, completion updates, archive/restore, completion summaries, archived mutation rejection, database migration, and restart persistence using a temporary database that is removed afterward.
