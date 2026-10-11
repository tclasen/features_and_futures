# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to 8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the configured SQLite file to preserve projects across restarts. Its parent directory is created automatically.

`GET /health` returns HTTP 200 with `{"status":"ok"}`.

The application uses server-rendered HTML and native forms. SQLite assigns an internal creation sequence for stable project ordering; public project IDs are UUIDs. Project names are trimmed before insertion and escaped when rendered.

## Verify

```sh
npm test
```

The tests launch real HTTP servers with a temporary SQLite file and check validation, creation order, navigation, HTML escaping, health, and persistence across process restarts.
