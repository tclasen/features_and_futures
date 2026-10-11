# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`.
`PORT` defaults to `8080`; `DB_PATH` defaults to `./data/workboard.sqlite`.
Project records persist in that SQLite file. `GET /health` returns
`{"status":"ok"}`.

## Verify

```sh
npm test
```

The integration test uses a temporary database and verifies validation,
creation order, escaped names, navigation, health, and persistence across a
server restart. Temporary files are removed afterward.
