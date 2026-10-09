# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0` and uses the configured SQLite file across restarts. Both environment variables are optional; the values above are the defaults.

Health check: `GET /health` returns `{"status":"ok"}`.

Project pages support task creation, completion checkboxes, and All/Open/Completed filtering. Tasks belong to their project and persist with completion state in SQLite.

The project list defaults to Active and can show Archived projects. Archive/restore preserves project IDs and tasks. Archived project pages allow viewing and filtering but not task changes. Each project row summarizes completed/total tasks. Existing databases are upgraded automatically.

Verify project and task creation, blank-input validation, HTML escaping, navigation, ordering, filtering, project isolation, archive/restore, summaries, database migration, and persistence across server restarts. A completion-client regression also exercises repeated check/uncheck updates, pending-write filtering, and failed-save recovery without page navigation:

```sh
npm test
```
