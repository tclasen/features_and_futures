# Workboard

Requires Node.js 22.22.1; no external dependencies.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. Defaults are port 8080 and `./data/workboard.sqlite`. Use the same database path across restarts to retain projects, archive state, tasks, and completion state.

`GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Project pages let you create tasks, toggle completion, and filter by All, Open, or Completed. Tasks stay within their project.

The project list filters Active or Archived projects and shows completion summaries. Archive/restore preserves tasks; archived project pages are read-only but still support task filtering.

Active project pages also support renaming. Names are trimmed and required; renaming preserves the project's URL, list position, tasks, and completion summary. Archived projects cannot be renamed until restored.

Each task row supports renaming its title. Titles are trimmed and required; renaming preserves ownership, order, completion, and summary counts. Archived projects disable task renaming until restored. Task titles persist across restarts.

Each task has a Task priority selector with Low, Normal, and High options. Existing and new tasks default to Normal. Priorities persist independently across renaming and restarts; archived projects disable priority editing until restored.

The built-in Node tests verify health, validation and trimming, creation order, project isolation, completion summaries, archive/restore, renaming, priorities, read-only enforcement, migration from the prior schema, and SQLite persistence across server restarts. Tests use temporary databases outside the repository.
