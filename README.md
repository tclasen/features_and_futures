# Workboard

Requires Node.js 22.22.1. No external dependencies or installation are needed.

```sh
npm start
```

The server binds to `0.0.0.0`, with `PORT` defaulting to `8080` and `DB_PATH` defaulting to `data/workboard.sqlite`. The database directory is created automatically. Use a persistent filesystem path to retain projects between restarts.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
npm test
```

`GET /health` returns `{"status":"ok"}`. The browser UI uses ordinary HTML forms, so JavaScript is not needed for project creation or navigation. Project names are trimmed on creation and escaped when displayed. Projects appear in insertion order.

The tests use a temporary SQLite database and real HTTP requests, including a server restart to check persistence.
