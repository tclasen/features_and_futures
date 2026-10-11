# Workboard

Requires Node.js 22.22.1. No dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Visit http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`. The configured SQLite file preserves projects,
tasks, and completion state across restarts. `GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration tests cover project and task validation, trimming, ordered rows,
detail navigation, task filtering and ownership, completion updates, HTML escaping,
health, and persistence across a server restart. Test databases are
created beneath `data/` and removed afterward.
