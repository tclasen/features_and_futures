# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite modules with no external dependencies.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Create projects and open them to create tasks, toggle completion, and filter by All, Open, or Completed. The server binds to `0.0.0.0` and defaults to port 8080 and `./data/workboard.sqlite` when environment variables are omitted. Keep the SQLite file to retain projects, tasks, and completion across restarts.

The project list initially shows Active projects. Each row includes its completed/total task summary. Archive a project to move it to the Archived filter, where it can be opened or restored. Archived project pages keep task filtering available while disabling task creation and completion changes. Existing databases migrate automatically without losing projects or tasks.

Active project pages also let you rename a project. Names are trimmed and required; renaming keeps the same URL, creation order, tasks, and summary. Archived projects cannot be renamed until restored.

Each task row lets you rename its title. Titles are trimmed and required; renaming preserves ownership, creation order, completion, filter membership, and project summaries. Archived projects disable task rename fields and buttons until restored.

Verify:

```sh
npm test
curl http://localhost:8080/health
```

The integration tests check health, project and task validation and trimming, creation order, project isolation, completion changes, detail routes, archive/restore, renaming while preserving identity and data, completion summaries, migration from an existing database, and persistence across server restarts using temporary SQLite files.
