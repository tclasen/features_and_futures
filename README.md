# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
npm start
```

The server binds to `0.0.0.0`, using `PORT` (default `8080`) and SQLite at
`DB_PATH` (default `./data/workboard.sqlite`). Parent directories are created
on startup. Keep that database file to preserve projects across restarts.

Example:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

`GET /health` returns `{"status":"ok"}`. The UI uses ordinary HTML forms;
JavaScript is not required in the browser. Project names are trimmed and
HTML-escaped, and projects are ordered by their persistent creation IDs.

Run automated HTTP and persistence tests:

```sh
npm test
```
