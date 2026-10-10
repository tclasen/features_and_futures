# Workboard

Requires Node.js 22.22.1. No application dependencies or installation steps.

```sh
npm start
```

The HTTP server binds to `0.0.0.0`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. Parent directories are created automatically. Keep the configured SQLite file to preserve projects across restarts.

```sh
PORT=8080 DB_PATH=/tmp/workboard.sqlite npm start
npm test
```

Open `/` to create and open projects. `GET /health` returns `{"status":"ok"}`. Tests use temporary SQLite files outside the repository and cover validation, creation order, routes, and persistence after a server restart.
