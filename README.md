# Workboard

Requires Node.js 22.22.1. There are no external dependencies or installation steps.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

The server binds to `0.0.0.0`. `PORT` defaults to `8080`; `DB_PATH` defaults to
`data/workboard.sqlite`. Keep the same database file to retain projects across
restarts. Its parent directory is created automatically.

Open `http://localhost:8080/`. Health is available at `GET /health` and returns
`{"status":"ok"}`. Project names are trimmed, and blank names are rejected.
Projects are ordered by their persistent, automatically assigned IDs.

Run automated checks with `npm test`. Tests use temporary SQLite files outside
the repository and start and restart real server processes.
