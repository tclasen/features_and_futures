# Workboard

Requires Node.js 22.22.1. No dependencies need installing.

```sh
npm start
```

The server binds to `0.0.0.0` on `PORT` (default `8080`). Set `DB_PATH` to
choose the persistent SQLite file (default `data/workboard.sqlite`). Parent
directories are created automatically. `GET /health` returns `{"status":"ok"}`.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
npm test
npm run check
```

Projects are stored in creation order with stable, automatically assigned IDs.
The browser uses `/api/projects` to list and create projects and
`/api/projects/:id` to load a project. Names are trimmed and must be nonblank.
