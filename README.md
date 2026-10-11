# Workboard

Requires Node.js 22.22.1. No installation or external dependencies are needed.

```sh
npm start
```

The HTTP server binds to `0.0.0.0` at `PORT` (default `8080`). SQLite data is stored at `DB_PATH` (default `data/workboard.sqlite`); parent directories are created automatically. Keep this file to preserve projects, tasks, and task completion across restarts.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The application uses server-rendered forms. Each project has its own tasks, completion checkboxes, and All/Open/Completed filter. Small browser change handlers submit completion and filter forms immediately; without JavaScript, fallback buttons submit them explicitly. Tests use a temporary database and check validation, escaping, ordering, project isolation, completion, filtering, detail navigation, and process-restart persistence.
