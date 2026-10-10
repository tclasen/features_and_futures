# Workboard

Projects and tasks application using Node.js 22.22.1, built-in HTTP and SQLite, and server-rendered HTML/CSS. No dependencies or install step are needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. `PORT` defaults to `8080` and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file to retain projects, tasks, completion state, and archive state across restarts. Existing databases are upgraded automatically.

Open a project to create tasks, toggle completion, and filter by All, Open, or Completed. Project rows show completed/total counts. Use the Active/Archived project filter to archive or restore projects. Archived projects retain their tasks but cannot create tasks or change completion until restored.

Health: `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

Tests use temporary databases and check labels, validation, trimming, ordering, safe rendering, navigation, health, task ownership, completion, filters, archive/restore, read-only enforcement, database migration, summaries, and persistence across server restarts.
