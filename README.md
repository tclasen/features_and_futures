# Workboard

Requires Node.js 22.22.1. No application dependencies or installation step.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. Both environment variables are optional; the values above are the defaults. The database directory is created automatically. Keep the SQLite file to preserve projects across restarts.

`GET /health` returns `{"status":"ok"}`.

Run the automated HTTP, validation, navigation markup, and persistence checks:

```sh
npm test
```

Tests use a temporary SQLite database and remove it afterward.
