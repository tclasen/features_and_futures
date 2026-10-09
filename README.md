# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite modules with no external dependencies.

```sh
npm start
```

The server listens on `0.0.0.0`, using `PORT` (default `8080`). Set `DB_PATH` to choose the persistent SQLite file (default `data/workboard.sqlite`). Parent directories are created automatically.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

Visit `/` to create and open projects. `GET /health` returns `{"status":"ok"}`. Project creation trims names and rejects blank names without inserting a row. Projects are listed by their persistent creation IDs.
