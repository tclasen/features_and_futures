# Workboard

Requires Node.js 22.22.1. No external dependencies or installation step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `GET /health` returns `{"status":"ok"}`. `PORT` defaults to `8080` and `DB_PATH` defaults to `data/workboard.sqlite`. The database directory is created automatically. Keep the SQLite file to preserve projects across restarts.

```sh
npm test
```

Tests use a temporary database and verify validation, escaped rendering, creation order, navigation, health, and persistence after restarting the server.
