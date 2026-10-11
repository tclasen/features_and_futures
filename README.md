# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. `PORT` defaults to `8080`; `DB_PATH` defaults to `data/workboard.sqlite`. The server binds to `0.0.0.0`. Keep the database file to preserve projects across restarts. Parent directories are created automatically.

`GET /health` returns `{"status":"ok"}`.

Run automated integration tests (including a server restart against a temporary SQLite file):

```sh
npm test
```
