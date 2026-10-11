# Workboard

Requires Node.js 22.22.1. No external dependencies or installation needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port 8080 and `./data/workboard.sqlite`.
`GET /health` returns `{"status":"ok"}`. Projects are persisted in SQLite.

Verify:

```sh
npm test
```

The integration test checks health, blank-name validation, trimming, creation order,
project routes, and persistence across server restarts using a temporary database.
