# Workboard

Requires Node.js 22.22.1. No installation or external dependencies are needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; the defaults are
port 8080 and `./data/workboard.sqlite`. The database directory is created
if necessary. Use the same `DB_PATH` after restarting to preserve projects.

`GET /health` returns `{"status":"ok"}`.

```sh
npm test
```

Tests exercise validation, creation order, escaped names, detail navigation,
health, and persistence across server restarts using a temporary SQLite file.
The UI uses native HTML forms and works without client-side scripting.
