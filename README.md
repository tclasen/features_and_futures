# Workboard

Requires Node.js 22.22.1. No dependencies to install.

## Run

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open http://localhost:8080. Defaults are port 8080 and `data/workboard.sqlite`.
The server binds to `0.0.0.0`. `GET /health` returns `{"status":"ok"}`.
Projects are saved in SQLite and retained across restarts. The UI uses native
HTML forms and works without client-side JavaScript.

## Verify

```sh
npm test
```

Tests use a temporary database outside the repository and verify validation,
creation order, escaping, navigation, health, and persistence across restarts.
