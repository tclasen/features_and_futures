# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). SQLite data is
stored at `DB_PATH` (default `./data/workboard.sqlite`); its parent directory is
created automatically. Keep the same database path across restarts to preserve
projects. For example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. `GET /health` returns `{"status":"ok"}`.

Run the automated HTTP and persistence checks with `npm test`.
