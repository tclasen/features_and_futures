# Workboard

Requires Node.js 22.22.1. No installation or external dependencies are needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. The server binds to `0.0.0.0`. `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file
to preserve project names and IDs across restarts. `GET /health` returns
`{"status":"ok"}`.

```sh
npm test
```

Tests use a temporary SQLite database, exercise HTTP routes and HTML form
contracts, and restart the server to check persistence.
