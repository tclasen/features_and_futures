# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0` and uses the configured SQLite file across restarts. Both environment variables are optional; the values above are the defaults.

Health check: `GET /health` returns `{"status":"ok"}`.

Verify project creation, blank-name validation, HTML escaping, navigation, ordering, and persistence across server restarts:

```sh
npm test
```
