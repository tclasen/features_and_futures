# Workboard

Requires Node.js 22.22.1; no external dependencies.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`. `GET /health` returns `{"status":"ok"}`.
Keep the configured SQLite file to retain projects across restarts.

## Verify

```sh
npm test
```

Integration tests use temporary databases outside the repository and check
validation, ordering, detail navigation, HTML escaping, and restart persistence.
