# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port `8080` and database path
`data/workboard.sqlite`. The server binds to `0.0.0.0`; keep the database file
to preserve projects across restarts. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration test uses a temporary SQLite database and verifies creation,
blank-name validation, ordering, HTML escaping, project navigation, health,
and persistence across process restarts.
