# Workboard

Requires Node.js 22.22.1. No dependency installation is needed.

```sh
PORT=8080 DB_PATH=./data/workboard.sqlite npm start
```

Open `http://localhost:8080`. The server binds to `0.0.0.0`; `PORT` defaults to
8080 and `DB_PATH` defaults to `./data/workboard.sqlite`. Keep the database file
to preserve projects across server restarts. `GET /health` returns
`{"status":"ok"}`.

Run the integration checks, including a server restart using a temporary SQLite
database:

```sh
npm test
```
