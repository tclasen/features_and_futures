# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`. Defaults are port `8080` and database `data/workboard.sqlite`. Keep the database file to preserve projects across restarts.

`GET /health` returns `{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration test uses an isolated temporary SQLite database and checks health, blank-name validation, trimming, creation order, detail lookup, page/asset serving, and persistence across process restarts.
