# Workboard

Requires Node.js 22.22.1. No dependencies or installation step.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). Set `DB_PATH` to the SQLite file to retain projects, archive state, tasks, and completion state across restarts; the default is `data/workboard.sqlite`. Parent directories are created automatically.

Example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Visit `/` to create or open projects, view completion summaries, and archive or restore projects. The project filter starts at Active. Each project page supports task creation, completion checkboxes, and All/Open/Completed filtering (initially All). Archived projects are read-only, but their tasks remain visible and filterable. Existing SQLite databases are upgraded automatically without losing data. `GET /health` returns `{"status":"ok"}`.

Run the integration tests (including process restart persistence):

```sh
npm test
```
