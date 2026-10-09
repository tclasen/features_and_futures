# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

Run with:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`; `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Reuse the same database
path to preserve projects across process restarts. `GET /health` returns
`{"status":"ok"}`.

Run the HTTP and SQLite persistence checks with:

```sh
npm test
```
