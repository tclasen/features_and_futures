# Workboard

Requires Node.js 22.22.1. No dependencies or installation step are needed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`). SQLite data is
stored at `DB_PATH` (default `./data/workboard.sqlite`). For example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `/` to create and open projects. Each project supports task creation,
completion checkboxes, and All, Open, and Completed filters. Projects and tasks
persist across server restarts. `GET /health` returns
`{"status":"ok"}`. Run the integration checks with `npm test`.
