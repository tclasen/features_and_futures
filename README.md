# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

Run:

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`.
`PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`.
Use the same database path across restarts to retain projects.
`GET /health` returns `{"status":"ok"}`.

Verify:

```sh
npm test
```

The integration test uses an isolated database, exercises project validation,
creation order, and project lookup, and restarts the server to verify persistence.
