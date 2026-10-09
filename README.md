# Workboard

Requires Node.js 22.22.1. Uses built-in HTTP and SQLite; no installation or external dependencies are needed.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `./data/workboard.sqlite`; the server binds to `0.0.0.0`. Keep the database file to preserve projects across restarts.

Health check:

```sh
curl http://localhost:8080/health
```

## Verify

```sh
npm test
```

Integration tests use a temporary SQLite database and verify health, blank-name validation, trimming, creation order, project lookup, page routes, and persistence after a server restart.
